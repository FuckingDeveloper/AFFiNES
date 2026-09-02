import { get as httpGet } from 'node:http';

import {
  allocateTrackWorkTaskMutation,
  createDevelopmentIntegrationMutation,
  importDevelopmentRepositoryMutation,
  testDevelopmentIntegrationMutation,
} from '@affine/graphql';
import { PrismaClient } from '@prisma/client';
import Sinon from 'sinon';

import { ConfigModule } from '../../../base/config';
import { QueueMetricsService } from '../../../base/job/queue/queue-metrics';
import { IntegrationJob } from '../../../plugins/integration/job';
import { registerTrackWorkTaskKeys } from '../integration/trackwork-test-utils';
import { createApp, e2e, Mockers, type TestingApp } from '../test';

const METRICS_PORT = 19464;
const METRICS_URL = `http://127.0.0.1:${METRICS_PORT}/metrics`;
const WEBHOOK_SECRET = 'super-secret-webhook';

function parseMetricLine(line: string): {
  name: string;
  labels: Record<string, string>;
  value: string;
} | null {
  const match =
    /^([A-Za-z_:][A-Za-z0-9_:]*)(?:\{([^}]*)\})?\s+(-?[\d.eE+]+)$/.exec(line);
  if (!match) {
    return null;
  }
  const labels: Record<string, string> = {};
  if (match[2]) {
    for (const part of match[2].split(',')) {
      const eq = part.indexOf('=');
      if (eq === -1) {
        continue;
      }
      labels[part.slice(0, eq)] = part.slice(eq + 1).replace(/^"|"$/g, '');
    }
  }
  return { name: match[1], labels, value: match[3] };
}

function findMetric(
  body: string,
  name: string,
  labels: Record<string, string>
) {
  return body
    .split('\n')
    .map(parseMetricLine)
    .find(
      line =>
        line?.name === name &&
        Object.entries(labels).every(([k, v]) => line.labels[k] === v)
    );
}

const scrapeMetrics = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    const req = httpGet(METRICS_URL, { agent: false }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end();
  });
};

const waitForMetrics = async (timeout = 10_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const body = await scrapeMetrics();
      if (body.length > 0) {
        return body;
      }
    } catch {
      // exporter server may still be starting
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('metrics endpoint did not come up');
};

const setupConnection = async (app: TestingApp, workspaceId: string) => {
  const created = await app.gql({
    query: createDevelopmentIntegrationMutation,
    variables: {
      input: {
        workspaceId,
        provider: 'gitlab',
        name: 'My GitLab',
        baseUrl: 'https://gitlab.example.org',
        token: 'glpat-secret-token',
        webhookSecret: WEBHOOK_SECRET,
      },
    },
  });

  const connectionId = created.createDevelopmentIntegration.id;

  await app.gql({
    query: importDevelopmentRepositoryMutation,
    variables: {
      input: {
        connectionId,
        externalId: '1',
        name: 'auth-service',
        fullName: 'mrh/auth-service',
        webUrl: 'https://gitlab.example.org/mrh/auth-service',
      },
    },
  });

  return connectionId;
};

const sendWebhook = (
  app: TestingApp,
  connectionId: string,
  payload: object,
  secret: string = WEBHOOK_SECRET
) => {
  return app
    .POST(`/api/integrations/gitlab/webhook/${connectionId}`)
    .set('X-Gitlab-Token', secret)
    .send(payload);
};

const processWebhookJobs = async (app: TestingApp) => {
  const handler = app.get(IntegrationJob);
  while (app.queue.count('integration.scm-webhook') > 0) {
    const job = app.queue.last('integration.scm-webhook');
    await handler.onScmWebhook({ data: { payload: job.payload } } as any);
    app.queue.add.resetHistory();
  }
};

const pushPayload = (
  projectId: number,
  ref: string,
  commits: Array<{ id: string; title: string; message: string }>
) => ({
  object_kind: 'push',
  ref,
  project: {
    id: projectId,
    path_with_namespace: 'mrh/auth-service',
    web_url: 'https://gitlab.example.org/mrh/auth-service',
  },
  commits,
});

let metricsApp: TestingApp;

e2e.before(async () => {
  metricsApp = await createApp({
    imports: [
      ConfigModule.override({
        metrics: { enabled: true, host: '127.0.0.1', port: METRICS_PORT },
      }),
    ],
  });
});

e2e.after(async () => {
  try {
    await metricsApp.close();
  } catch (e) {
    console.error(
      'CLOSE_ERROR',
      JSON.stringify(e, Object.getOwnPropertyNames(e))
    );
    throw e;
  }
});

e2e('exposes bounded TrackWork metrics without leaking secrets', async t => {
  const owner = await metricsApp.create(Mockers.User);
  const workspace = await metricsApp.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await metricsApp.login(owner);
  await registerTrackWorkTaskKeys(workspace.id, ['TW-142']);

  const connectionId = await setupConnection(metricsApp, workspace.id);
  const db = metricsApp.get(PrismaClient);

  const push = pushPayload(1, 'refs/heads/feature/TW-142-obs', [
    {
      id: 'a83f1d2c71',
      title: 'Add observability',
      message: 'fix: TW-142 add observability metrics',
    },
  ]);

  const accepted = await sendWebhook(metricsApp, connectionId, push);
  t.is(accepted.status, 200);
  t.truthy(accepted.headers['x-request-id']);
  await processWebhookJobs(metricsApp);

  await sendWebhook(metricsApp, connectionId, push);
  await processWebhookJobs(metricsApp);

  const rejected = await sendWebhook(
    metricsApp,
    connectionId,
    push,
    'wrong-secret'
  );
  t.is(rejected.status, 404);

  await metricsApp.gql({
    query: allocateTrackWorkTaskMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        docId: 'task-doc-obs-1',
        prefix: 'TW',
        relatedDocumentIds: [],
        legacyTasks: [],
      },
    },
  });

  const queueMetrics = metricsApp.get(QueueMetricsService);
  await queueMetrics.collect();

  const fetchStub = Sinon.stub(globalThis, 'fetch').rejects(
    new Error('provider unavailable')
  );
  t.teardown(() => fetchStub.restore());
  try {
    const result = await metricsApp.gql({
      query: testDevelopmentIntegrationMutation,
      variables: { connectionId },
    });
    t.is(result.testDevelopmentIntegration.ok, false);
  } finally {
    fetchStub.restore();
  }

  const body = await waitForMetrics();

  const received = findMetric(body, 'trackwork_webhook_received_total', {
    provider: 'gitlab',
  });
  t.truthy(received);
  t.is(received!.value, '3');

  const queued = findMetric(body, 'trackwork_webhook_total', {
    provider: 'gitlab',
    result: 'queued',
  });
  t.truthy(queued);
  t.is(queued!.value, '2');

  const invalid = findMetric(body, 'trackwork_webhook_total', {
    provider: 'gitlab',
    result: 'invalid_signature',
  });
  t.truthy(invalid);
  t.is(invalid!.value, '1');

  const processed = findMetric(body, 'trackwork_webhook_event_total', {
    provider: 'gitlab',
    eventType: 'commit.pushed',
    result: 'processed',
  });
  t.truthy(processed);
  t.is(processed!.value, '1');

  const duplicate = findMetric(body, 'trackwork_webhook_event_total', {
    provider: 'gitlab',
    eventType: 'commit.pushed',
    result: 'duplicate',
  });
  t.truthy(duplicate);
  t.is(duplicate!.value, '1');

  const allocated = findMetric(body, 'trackwork_task_allocation_total', {
    result: 'allocated',
  });
  t.truthy(allocated);
  t.is(allocated!.value, '1');

  const gqlCounter = findMetric(body, 'gql_query_counter_total', {});
  t.truthy(gqlCounter);

  const scmRequest = findMetric(body, 'trackwork_function_calls_total', {
    name: 'scm_request',
    operation: 'test_connection',
    provider: 'gitlab',
    error: 'false',
  });
  t.truthy(scmRequest);
  t.is(scmRequest!.value, '1');

  const jobDepth = findMetric(body, 'queue_job_depth', {
    queue: 'integration',
    state: 'waiting',
  });
  t.truthy(jobDepth);

  t.is(
    await db.developmentTaskLink.count({
      where: { workspaceId: workspace.id, taskKey: 'TW-142' },
    }),
    2
  );

  t.false(body.includes(WEBHOOK_SECRET));
  t.false(body.includes('glpat-secret-token'));
  t.false(body.includes('Bearer '));
  t.false(body.includes('a83f1d2c71'));
  t.false(body.includes('add observability metrics'));
});

e2e('reports invalid allocation outcomes with bounded labels', async t => {
  const owner = await metricsApp.create(Mockers.User);
  const workspace = await metricsApp.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await metricsApp.login(owner);

  await t.throwsAsync(() =>
    metricsApp.gql({
      query: allocateTrackWorkTaskMutation,
      variables: {
        input: {
          workspaceId: workspace.id,
          docId: 'task-doc-invalid-1',
          prefix: 'invalid-prefix!',
          relatedDocumentIds: [],
          legacyTasks: [],
        },
      },
    })
  );

  const body = await waitForMetrics();

  const invalid = findMetric(body, 'trackwork_task_allocation_total', {
    result: 'invalid',
  });
  t.truthy(invalid);
  t.is(invalid!.value, '1');
});
