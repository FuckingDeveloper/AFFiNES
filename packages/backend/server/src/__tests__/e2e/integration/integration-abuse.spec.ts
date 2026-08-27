import { PrismaClient } from '@prisma/client';
import Sinon from 'sinon';

import {
  createDevelopmentIntegrationMutation,
  refreshDevelopmentPipelinesMutation,
} from '@affine/graphql';
import { app, e2e, Mockers } from '../test';

const WEBHOOK_SECRET = 'super-secret';

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

  return created.createDevelopmentIntegration.id;
};

const sendWebhook = async (connectionId: string, payload: object) => {
  return app
    .POST(`/api/integrations/gitlab/webhook/${connectionId}`)
    .set('X-Gitlab-Token', WEBHOOK_SECRET)
    .send(payload)
    .expect(200);
};

e2e('webhook does not reveal connection existence', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);

  const connectionId = await setupGitlab(workspace.id);
  const url = `/api/integrations/gitlab/webhook/${connectionId}`;
  const missingUrl = `/api/integrations/gitlab/webhook/${'f'.repeat(36)}`;

  // invalid secret on a real connection and unknown connection respond identically
  const invalidSecret = await app
    .POST(url)
    .set('X-Gitlab-Token', 'wrong-secret')
    .send({ object_kind: 'push' });

  const unknownConnection = await app
    .POST(missingUrl)
    .set('X-Gitlab-Token', WEBHOOK_SECRET)
    .send({ object_kind: 'push' });

  t.is(invalidSecret.status, 404);
  t.is(unknownConnection.status, 404);
  t.is(invalidSecret.body.message, unknownConnection.body.message);
});

e2e('rejects oversized webhook payloads', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);

  const connectionId = await setupGitlab(workspace.id);
  const url = `/api/integrations/gitlab/webhook/${connectionId}`;

  const huge = 'x'.repeat(300 * 1024);

  const res = await app
    .POST(url)
    .set('X-Gitlab-Token', WEBHOOK_SECRET)
    .send({ object_kind: 'push', blob: huge });

  t.is(res.status, 413);
});

e2e('rate limits the webhook endpoint', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);

  const connectionId = await setupGitlab(workspace.id);
  const url = `/api/integrations/gitlab/webhook/${connectionId}`;

  const payload = { object_kind: 'push', project: { id: 1 }, commits: [] };

  let lastStatus = 200;
  for (let i = 0; i < 65; i++) {
    const res = await app
      .POST(url)
      .set('X-Gitlab-Token', WEBHOOK_SECRET)
      .send(payload);
    lastStatus = res.status;
    if (res.status !== 200) {
      break;
    }
  }

  t.is(lastStatus, 429);
});

e2e('caps development links and activity per task', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);

  const connectionId = await setupGitlab(workspace.id);
  const db = app.get(PrismaClient);

  await db.developmentTaskLink.createMany({
    data: Array.from({ length: 2000 }, (_, i) => ({
      workspaceId: workspace.id,
      connectionId,
      repositoryId: 'repo',
      taskKey: 'TASK-142',
      entityType: 'commit',
      externalId: `existing-${i}`,
      url: 'https://example.org',
      title: `existing ${i}`,
      metadata: {},
    })),
  });

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
        id: 'newcommit1',
        title: 'New commit',
        message: 'fix: TASK-142 new commit',
        author_name: 'Alice',
      },
    ],
  });

  const handler = app.get(
    (await import('../../../plugins/integration/job')).IntegrationJob
  );
  const job = app.queue.last('integration.scm-webhook');
  await handler.onScmWebhook({ data: { payload: job.payload } } as any);

  const links = await db.developmentTaskLink.count({
    where: { workspaceId: workspace.id, taskKey: 'TASK-142' },
  });

  t.is(links, 2000);

  const activity = await db.developmentActivity.count({
    where: { workspaceId: workspace.id, taskKey: 'TASK-142' },
  });

  t.is(activity, 0);
});

e2e('rate limits pipeline refreshes per connection', async t => {
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

  const stub = Sinon.stub(globalThis, 'fetch').resolves({
    ok: true,
    status: 200,
    json: async () => ({ jobs: [] }),
    text: async () => '{}',
  } as Response);

  try {
    const first = await app.gql({
      query: refreshDevelopmentPipelinesMutation,
      variables: { connectionId },
    });
    t.truthy(first.refreshDevelopmentPipelines);

    await t.throwsAsync(() =>
      app.gql({
        query: refreshDevelopmentPipelinesMutation,
        variables: { connectionId },
      })
    );
  } finally {
    stub.restore();
  }
});
