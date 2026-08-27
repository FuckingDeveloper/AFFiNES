import { PrismaClient } from '@prisma/client';
import Sinon from 'sinon';

import {
  createDevelopmentIntegrationMutation,
  importDevelopmentRepositoryMutation,
  refreshDevelopmentPipelinesMutation,
  trackWorkActivityQuery,
} from '@affine/graphql';
import { IntegrationConnectionService } from '../../../plugins/integration/service';
import { app, e2e, Mockers } from '../test';

const clearRefreshRateLimit = () => {
  const service = app.get(IntegrationConnectionService) as unknown as {
    pipelineRefreshAt: Map<string, number>;
  };
  service.pipelineRefreshAt.clear();
};

const WEBHOOK_SECRET = 'super-secret';

const sendWebhook = async (connectionId: string, payload: object) => {
  return app
    .POST(`/api/integrations/gitlab/webhook/${connectionId}`)
    .set('X-Gitlab-Token', WEBHOOK_SECRET)
    .send(payload)
    .expect(200);
};

const setupGitlab = async (workspaceId: string) => {
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

const processWebhookJobs = async () => {
  const handler = app.get(
    (await import('../../../plugins/integration/job')).IntegrationJob
  );
  while (app.queue.count('integration.scm-webhook') > 0) {
    const job = app.queue.last('integration.scm-webhook');
    await handler.onScmWebhook({ data: { payload: job.payload } } as any);
    app.queue.add.resetHistory();
  }
};

e2e('records activity for gitlab webhook events', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);

  const connectionId = await setupGitlab(workspace.id);

  await sendWebhook(connectionId, {
    object_kind: 'push',
    ref: 'refs/heads/main',
    project: {
      id: 1,
      path_with_namespace: 'mrh/auth-service',
      web_url: 'https://gitlab.example.org/mrh/auth-service',
    },
    commits: [
      {
        id: 'deadbeef42',
        title: 'Fix refresh token',
        message: 'fix(auth): TW-142 refresh token',
        author_name: 'Alice',
      },
    ],
  });
  await processWebhookJobs();

  await sendWebhook(connectionId, {
    object_kind: 'merge_request',
    project: {
      id: 1,
      path_with_namespace: 'mrh/auth-service',
      web_url: 'https://gitlab.example.org/mrh/auth-service',
    },
    object_attributes: {
      id: 318000,
      iid: 318,
      title: 'Fix refresh token handling [TW-142]',
      description: '',
      state: 'opened',
      action: 'open',
      source_branch: 'feature/TW-142-refresh-token',
      target_branch: 'main',
      url: 'https://gitlab.example.org/mrh/auth-service/-/merge_requests/318',
      author: { name: 'Bob' },
      updated_at: '2026-08-27T10:00:00Z',
    },
  });
  await processWebhookJobs();

  const db = app.get(PrismaClient);
  const activities = await db.developmentActivity.findMany({
    where: { workspaceId: workspace.id, taskKey: 'TW-142' },
    orderBy: { createdAt: 'asc' },
  });

  t.is(activities.length, 2);
  t.is(activities[0].eventType, 'commit.pushed');
  t.is(activities[0].title, 'Fix refresh token');
  t.is(activities[0].authorName, 'Alice');
  t.is(activities[0].repositoryName, 'mrh/auth-service');
  t.is(activities[1].eventType, 'merge_request.opened');
});

e2e('records activity only on pipeline status change', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);

  const created = await app.gql({
    query: createDevelopmentIntegrationMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        provider: 'jenkins',
        name: 'CI',
        baseUrl: 'https://ci.example.org',
        token: 'jenkins-api-token',
        username: 'ci-bot',
      },
    },
  });
  const connectionId = created.createDevelopmentIntegration.id;
  const db = app.get(PrismaClient);

  const jenkinsResponse = (result: string | null, building = false) =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        jobs: [
          {
            name: 'TW-142-deploy',
            color: 'blue',
            builds: [
              {
                number: 1,
                result,
                building,
                timestamp: 1724700000000,
                duration: 90000,
                url: 'https://ci.example.org/job/TW-142-deploy/1/',
                description: null,
              },
            ],
          },
        ],
      }),
      text: async () => '{}',
    }) as Response;

  const stub = Sinon.stub(globalThis, 'fetch');
  stub.resolves(jenkinsResponse(null, true));

  try {
    await app.gql({
      query: refreshDevelopmentPipelinesMutation,
      variables: { connectionId },
    });
  } finally {
    stub.restore();
  }
  clearRefreshRateLimit();

  const running = await db.developmentActivity.count({
    where: { workspaceId: workspace.id, taskKey: 'TW-142' },
  });
  t.is(running, 1);

  const stub2 = Sinon.stub(globalThis, 'fetch');
  stub2.resolves(jenkinsResponse('SUCCESS'));

  try {
    await app.gql({
      query: refreshDevelopmentPipelinesMutation,
      variables: { connectionId },
    });
  } finally {
    stub2.restore();
  }
  clearRefreshRateLimit();

  const succeeded = await db.developmentActivity.count({
    where: { workspaceId: workspace.id, taskKey: 'TW-142' },
  });
  t.is(succeeded, 2);

  const stub3 = Sinon.stub(globalThis, 'fetch');
  stub3.resolves(jenkinsResponse('SUCCESS'));

  try {
    await app.gql({
      query: refreshDevelopmentPipelinesMutation,
      variables: { connectionId },
    });
  } finally {
    stub3.restore();
  }
  clearRefreshRateLimit();

  const unchanged = await db.developmentActivity.count({
    where: { workspaceId: workspace.id, taskKey: 'TW-142' },
  });
  t.is(unchanged, 2);
});

e2e('paginates activity and scopes it to task keys', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);

  const connectionId = await setupGitlab(workspace.id);

  for (let i = 0; i < 5; i++) {
    await sendWebhook(connectionId, {
      object_kind: 'push',
      ref: 'refs/heads/main',
      project: {
        id: 1,
        path_with_namespace: 'mrh/auth-service',
        web_url: 'https://gitlab.example.org/mrh/auth-service',
      },
      commits: [
        {
          id: `commit-${i}`,
          title: `Commit ${i}`,
          message: `fix: TW-160 commit ${i}`,
          author_name: 'Alice',
        },
      ],
    });
    await processWebhookJobs();
  }

  const first = await app.gql({
    query: trackWorkActivityQuery,
    variables: { workspaceId: workspace.id, taskKey: 'TW-160', first: 2 },
  });

  t.is(first.trackWorkActivity.items.length, 2);
  t.true(first.trackWorkActivity.hasNextPage);
  t.truthy(first.trackWorkActivity.nextCursor);

  const second = await app.gql({
    query: trackWorkActivityQuery,
    variables: {
      workspaceId: workspace.id,
      taskKey: 'TW-160',
      first: 2,
      after: first.trackWorkActivity.nextCursor ?? undefined,
    },
  });

  t.is(second.trackWorkActivity.items.length, 2);

  const third = await app.gql({
    query: trackWorkActivityQuery,
    variables: {
      workspaceId: workspace.id,
      taskKey: 'TW-160',
      first: 2,
      after: second.trackWorkActivity.nextCursor ?? undefined,
    },
  });

  t.is(third.trackWorkActivity.items.length, 1);
  t.false(third.trackWorkActivity.hasNextPage);

  const otherKey = await app.gql({
    query: trackWorkActivityQuery,
    variables: { workspaceId: workspace.id, taskKey: 'TW-999', first: 10 },
  });

  t.is(otherKey.trackWorkActivity.items.length, 0);
});

e2e('activity requires workspace access', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  const outsider = await app.create(Mockers.User);

  await app.login(outsider);

  await t.throwsAsync(() =>
    app.gql({
      query: trackWorkActivityQuery,
      variables: { workspaceId: workspace.id, taskKey: 'TW-142', first: 10 },
    })
  );
});
