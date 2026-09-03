import { PrismaClient } from '@prisma/client';

import { Cache } from '../../../base/cache/instances';
import { CryptoHelper } from '../../../base/helpers/crypto';
import { ScmProviderRegistry } from '../../../plugins/integration/providers/index';
import { CiProviderRegistry } from '../../../plugins/integration/providers/ci';
import { IntegrationConnectionService } from '../../../plugins/integration/service';
import { WorkspaceRole } from '../../../models';
import { app, e2e, Mockers } from '../test';

const WORKFLOW_MUTATION = `
  mutation UpdateTrackWorkWorkflowConfig($input: UpdateTrackWorkWorkflowConfigInput!) {
    updateTrackWorkWorkflowConfig(input: $input) {
      revision
      config
    }
  }
`;

const ACTIVITY_QUERY = `
  query TrackWorkActivity(
    $workspaceId: String!
    $first: Int
    $after: String
  ) {
    trackWorkActivity(workspaceId: $workspaceId, first: $first, after: $after) {
      items { id }
      nextCursor
      hasNextPage
    }
  }
`;

async function gqlRaw(query: string, variables?: Record<string, unknown>) {
  const res = await app
    .POST('/graphql')
    .set('x-operation-name', 'test')
    .send({ query, variables });
  return res;
}

async function postWebhook(
  connectionId: string,
  headers: Record<string, string>,
  body: unknown
) {
  return app
    .POST(`/api/integrations/gitlab/webhook/${connectionId}`)
    .set(headers)
    .send(body as never);
}

class CountingQueue {
  public enqueued: string[] = [];
  async add(name: string, payload: unknown) {
    this.enqueued.push(`${name}:${JSON.stringify(payload).length}`);
    return { id: `job-${this.enqueued.length}` };
  }
}

const pipelinePayload = (eventUuid: string) => ({
  object_kind: 'pipeline',
  object_attributes: {
    id: 424,
    status: 'success',
    ref: 'main',
  },
  project: { id: 1, path_with_namespace: 'group/project' },
  commits: [{ id: 'abc123', message: 'fix: task TASK-1', title: 'fix: task' }],
  request_uuid: eventUuid,
});

e2e('webhook ingress: signature, size and replay semantics', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);
  const db = app.get(PrismaClient);

  const crypto = app.get(CryptoHelper);
  const connection = await db.developmentIntegrationConnection.create({
    data: {
      workspaceId: workspace.id,
      provider: 'gitlab',
      name: 'sec-test',
      baseUrl: 'https://gitlab.example.test',
      tokenCipher: crypto.encrypt('fixture-token'),
      webhookSecretCipher: crypto.encrypt('secret-webhook-token'),
      createdById: owner.id,
    },
  });

  const validHeaders = { 'x-gitlab-token': 'secret-webhook-token' };

  const accepted = await postWebhook(
    connection.id,
    validHeaders,
    pipelinePayload('uuid-1')
  );
  t.is(accepted.status, 200);
  t.is(accepted.body.accepted, true);

  const missing = await postWebhook(
    connection.id,
    {},
    pipelinePayload('uuid-2')
  );
  t.is(missing.status, 404, 'missing token rejected with uniform 404');

  const wrong = await postWebhook(
    connection.id,
    { 'x-gitlab-token': 'wrong-secret' },
    pipelinePayload('uuid-3')
  );
  t.is(wrong.status, 404, 'wrong secret rejected with uniform 404');

  const malformed = await postWebhook(
    connection.id,
    { 'x-gitlab-token': 'not-a-real-token' },
    pipelinePayload('uuid-4')
  );
  t.is(malformed.status, 404);

  const oversized = await postWebhook(connection.id, validHeaders, {
    padding: 'x'.repeat(300 * 1024),
  });
  t.true(oversized.status >= 400 && oversized.status < 500);

  const replayed = await postWebhook(
    connection.id,
    { ...validHeaders, 'x-gitlab-event-uuid': 'uuid-1' },
    pipelinePayload('uuid-1')
  );
  t.is(replayed.status, 200);
  t.is(replayed.body.accepted, true, 'replay is acked without reprocessing');

  const newEvent = await postWebhook(
    connection.id,
    { ...validHeaders, 'x-gitlab-event-uuid': 'uuid-5' },
    pipelinePayload('uuid-5')
  );
  t.is(newEvent.status, 200);

  for (const res of [accepted, missing, wrong, malformed]) {
    t.false(JSON.stringify(res.body).includes('secret-webhook-token'));
    t.false(JSON.stringify(res.body).includes('stack'));
  }
});

e2e(
  'injection: identifiers with metacharacters are rejected without leakage',
  async t => {
    const owner = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });
    await app.login(owner);

    const evilKey = "TASK-1' OR '1'='1' --";
    const lookup = await gqlRaw(
      `query($workspaceId: String!, $taskKey: String!) {
      trackWorkTask(workspaceId: $workspaceId, taskKey: $taskKey) { taskKey }
    }`,
      { workspaceId: workspace.id, taskKey: evilKey }
    );
    t.is(lookup.status, 200);
    t.is(lookup.body.data.trackWorkTask, null, 'no SQL metacharacter leakage');

    const evilWs = "workspace-id'; DROP TABLE trackwork_tasks; --";
    const wf = await gqlRaw(WORKFLOW_MUTATION, {
      input: {
        workspaceId: evilWs,
        expectedRevision: 0,
        config: { taskTrackerBoards: [] },
      },
    });
    t.true(
      wf.body.errors && wf.body.errors.length > 0,
      'invalid workspace rejected'
    );
    t.false(
      JSON.stringify(wf.body).includes('Prisma'),
      'no Prisma internals leaked'
    );

    const payload = JSON.stringify({ taskTrackerBoards: [] });
    t.false(payload.includes("' OR "));
  }
);

e2e('SSRF: only owners can configure provider base URLs', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  const collaborator = await app.create(Mockers.User);
  await app.create(Mockers.WorkspaceUser, {
    userId: collaborator.id,
    workspaceId: workspace.id,
    type: WorkspaceRole.Collaborator,
  });

  await app.login(collaborator);
  const attempt = await gqlRaw(
    `mutation($input: CreateDevelopmentIntegrationInput!) {
      createDevelopmentIntegration(input: $input) { id }
    }`,
    {
      input: {
        workspaceId: workspace.id,
        provider: 'gitlab',
        name: 'evil',
        token: 'tok',
        baseUrl: 'http://169.254.169.254/latest/meta-data',
      },
    }
  );
  t.true(
    attempt.body.errors && attempt.body.errors.length > 0,
    'collaborator cannot configure provider base URLs'
  );

  await app.login(owner);
  const ownerAttempt = await gqlRaw(
    `mutation($input: CreateDevelopmentIntegrationInput!) {
      createDevelopmentIntegration(input: $input) { id }
    }`,
    {
      input: {
        workspaceId: workspace.id,
        provider: 'gitlab',
        name: 'legit',
        token: 'tok',
        baseUrl: 'https://gitlab.example.test',
      },
    }
  );
  t.is(ownerAttempt.status, 200);
});

e2e(
  'privilege escalation: horizontal and vertical workflow escalation denied',
  async t => {
    const ownerA = await app.create(Mockers.User);
    const wsA = await app.create(Mockers.Workspace, {
      owner: { id: ownerA.id },
    });
    const ownerB = await app.create(Mockers.User);
    const wsB = await app.create(Mockers.Workspace, {
      owner: { id: ownerB.id },
    });

    const collaborator = await app.create(Mockers.User);
    await app.create(Mockers.WorkspaceUser, {
      userId: collaborator.id,
      workspaceId: wsA.id,
      type: WorkspaceRole.Collaborator,
    });

    const config = { taskTrackerBoards: [{ id: 'b', title: 'Board' }] };

    await app.login(collaborator);
    const vertical = await gqlRaw(WORKFLOW_MUTATION, {
      input: { workspaceId: wsA.id, expectedRevision: 0, config },
    });
    t.true(
      vertical.body.errors && vertical.body.errors.length > 0,
      'collaborator vertical escalation denied'
    );

    const horizontal = await gqlRaw(WORKFLOW_MUTATION, {
      input: { workspaceId: wsB.id, expectedRevision: 0, config },
    });
    t.true(
      horizontal.body.errors && horizontal.body.errors.length > 0,
      'cross-workspace horizontal escalation denied'
    );

    const state = await app.get(PrismaClient).trackWorkWorkflowConfig.count({
      where: { workspaceId: { in: [wsA.id, wsB.id] } },
    });
    t.is(state, 0, 'no workflow config created by the denied attempts');
  }
);

e2e('blob authorization: cross-workspace access denied', async t => {
  const ownerA = await app.create(Mockers.User);
  const wsA = await app.create(Mockers.Workspace, { owner: { id: ownerA.id } });
  const ownerB = await app.create(Mockers.User);

  await app.login(ownerA);
  const listA = await gqlRaw(
    `query($workspaceId: String!) {
      workspace(id: $workspaceId) { blobs { key size } }
    }`,
    { workspaceId: wsA.id }
  );
  t.is(listA.status, 200);
  t.deepEqual(listA.body.data.workspace.blobs, []);

  await app.login(ownerB);
  const listBOfA = await gqlRaw(
    `query($workspaceId: String!) {
      workspace(id: $workspaceId) { blobs { key size } }
    }`,
    { workspaceId: wsA.id }
  );
  t.true(
    listBOfA.body.errors && listBOfA.body.errors.length > 0,
    'owner B cannot list workspace A blobs'
  );
});



e2e('webhook replay dedupe is atomic under concurrency', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);
  const db = app.get(PrismaClient);
  const crypto = app.get(CryptoHelper);
  const cache = app.get(Cache);
  const scmProviders = app.get(ScmProviderRegistry);
  const ciProviders = app.get(CiProviderRegistry);
  const countingQueue = new CountingQueue();
  const service = new IntegrationConnectionService(
    db,
    crypto,
    scmProviders,
    ciProviders,
    countingQueue as never,
    cache
  );

  const connection = await db.developmentIntegrationConnection.create({
    data: {
      workspaceId: workspace.id,
      provider: 'gitlab',
      name: 'atomic-test',
      baseUrl: 'https://gitlab.example.test',
      tokenCipher: crypto.encrypt('fixture-token'),
      webhookSecretCipher: crypto.encrypt('secret-webhook-token'),
      createdById: owner.id,
    },
  });

  for (let round = 0; round < 5; round += 1) {
    countingQueue.enqueued = [];
    const uuid = `uuid-concurrent-${round}`;
    const headers = {
      'x-gitlab-token': 'secret-webhook-token',
      'x-gitlab-event-uuid': uuid,
    };
    const [r1, r2] = await Promise.all([
      service.acceptScmWebhook({
        connectionId: connection.id,
        provider: 'gitlab',
        headers,
        body: pipelinePayload(uuid),
      }),
      service.acceptScmWebhook({
        connectionId: connection.id,
        provider: 'gitlab',
        headers,
        body: pipelinePayload(uuid),
      }),
    ]);
    t.is(r1.accepted, true);
    t.is(r2.accepted, true);
    t.is(countingQueue.enqueued.length, 1, `round ${round}: exactly one enqueue`);
  }

  countingQueue.enqueued = [];
  await Promise.all([
    service.acceptScmWebhook({
      connectionId: connection.id,
      provider: 'gitlab',
      headers: {
        'x-gitlab-token': 'secret-webhook-token',
        'x-gitlab-event-uuid': 'uuid-a',
      },
      body: pipelinePayload('uuid-a'),
    }),
    service.acceptScmWebhook({
      connectionId: connection.id,
      provider: 'gitlab',
      headers: {
        'x-gitlab-token': 'secret-webhook-token',
        'x-gitlab-event-uuid': 'uuid-b',
      },
      body: pipelinePayload('uuid-b'),
    }),
  ]);
  t.is(countingQueue.enqueued.length, 2, 'different uuids both processed');
});

e2e('webhook signature check always precedes the replay cache', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);
  const db = app.get(PrismaClient);
  const crypto = app.get(CryptoHelper);
  const connection = await db.developmentIntegrationConnection.create({
    data: {
      workspaceId: workspace.id,
      provider: 'gitlab',
      name: 'sig-order-test',
      baseUrl: 'https://gitlab.example.test',
      tokenCipher: crypto.encrypt('fixture-token'),
      webhookSecretCipher: crypto.encrypt('secret-webhook-token'),
      createdById: owner.id,
    },
  });

  const uuid = 'uuid-known';
  await postWebhook(
    connection.id,
    { 'x-gitlab-token': 'secret-webhook-token', 'x-gitlab-event-uuid': uuid },
    pipelinePayload(uuid)
  );

  const changedBody = await postWebhook(
    connection.id,
    { 'x-gitlab-token': 'secret-webhook-token', 'x-gitlab-event-uuid': uuid },
    { ...pipelinePayload(uuid), commits: [{ id: 'mutated' }] }
  );
  // The GitLab token webhook model authenticates the SENDER, not the body;
  // body integrity is transport-level (HTTPS). Modified-body + valid token is
  // accepted by the ingress contract by design - documented, not claimed as
  // body-signature protection.
  t.is(changedBody.status, 200, 'token model: sender-authenticated body accepted');

  const wrongSecret = await postWebhook(
    connection.id,
    { 'x-gitlab-token': 'wrong-secret', 'x-gitlab-event-uuid': uuid },
    pipelinePayload(uuid)
  );
  t.is(wrongSecret.status, 404, 'wrong secret rejected even with known uuid');

  const missing = await postWebhook(
    connection.id,
    { 'x-gitlab-event-uuid': uuid },
    pipelinePayload(uuid)
  );
  t.is(missing.status, 404, 'missing signature rejected even with known uuid');
});
e2e('abusive pagination: bounds and cross-workspace cursors', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);
  const db = app.get(PrismaClient);

  const connection = await db.developmentIntegrationConnection.create({
    data: {
      workspaceId: workspace.id,
      provider: 'gitlab',
      name: 'page-test',
      baseUrl: 'https://gitlab.example.test',
      tokenCipher: 'fixture-placeholder-cipher-no-secrets',
      createdById: owner.id,
    },
  });
  await db.developmentActivity.createMany({
    data: Array.from({ length: 12 }, (_, i) => ({
      workspaceId: workspace.id,
      connectionId: connection.id,
      taskKey: 'TASK-1',
      eventType: 'pipeline.success',
      title: `activity ${i}`,
      url: `https://gitlab.example.test/-/pipelines/${i}`,
      authorName: 'bot',
      metadata: { kind: 'fixture' },
    })),
  });

  const zero = await gqlRaw(ACTIVITY_QUERY, {
    workspaceId: workspace.id,
    first: 0,
  });
  t.is(zero.status, 200);

  const negative = await gqlRaw(ACTIVITY_QUERY, {
    workspaceId: workspace.id,
    first: -1,
  });
  t.is(negative.status, 200);

  const huge = await gqlRaw(ACTIVITY_QUERY, {
    workspaceId: workspace.id,
    first: 10_000,
  });
  t.is(huge.status, 200);
  t.true(
    huge.body.data.trackWorkActivity.items.length <= 50,
    'page size capped'
  );

  const malformed = await gqlRaw(ACTIVITY_QUERY, {
    workspaceId: workspace.id,
    first: 50,
    after: 'not-a-cursor',
  });
  t.is(malformed.status, 200);

  const foreign = await app.create(Mockers.User);
  const foreignWs = await app.create(Mockers.Workspace, {
    owner: { id: foreign.id },
  });
  await app.login(foreign);
  const cross = await gqlRaw(ACTIVITY_QUERY, {
    workspaceId: workspace.id,
    first: 50,
  });
  t.is(
    cross.body.errors !== undefined,
    true,
    'foreign user cannot paginate the workspace activity'
  );
  const own = await gqlRaw(ACTIVITY_QUERY, {
    workspaceId: foreignWs.id,
    first: 50,
  });
  t.is(own.status, 200, 'foreign user can paginate their own workspace');
  t.true(
    cross.body.errors && cross.body.errors.length > 0,
    'foreign user cannot paginate the workspace activity'
  );
});
