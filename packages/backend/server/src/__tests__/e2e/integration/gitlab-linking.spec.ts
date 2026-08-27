import { PrismaClient } from '@prisma/client';

import {
  createDevelopmentIntegrationMutation,
  importDevelopmentRepositoryMutation,
  trackWorkTaskDevelopmentQuery,
} from '@affine/graphql';
import { IntegrationJob } from '../../../plugins/integration/job';
import { app, e2e, Mockers } from '../test';

const WEBHOOK_SECRET = 'super-secret';

const setupConnection = async (workspaceId: string) => {
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

const sendWebhook = async (connectionId: string, payload: object) => {
  return app
    .POST(`/api/integrations/gitlab/webhook/${connectionId}`)
    .set('X-Gitlab-Token', WEBHOOK_SECRET)
    .send(payload)
    .expect(200);
};

const processWebhookJobs = async () => {
  const handler = app.get(IntegrationJob);
  while (app.queue.count('integration.scm-webhook') > 0) {
    const job = app.queue.last('integration.scm-webhook');
    await handler.onScmWebhook({ data: { payload: job.payload } } as any);
    app.queue.add.resetHistory();
  }
};

const getLinkCount = async (
  db: PrismaClient,
  workspaceId: string,
  taskKey: string
) => {
  return db.developmentTaskLink.count({
    where: { workspaceId, taskKey },
  });
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

const mrPayload = (
  projectId: number,
  iid: number,
  action: string,
  state: string,
  title: string,
  updatedAt = '2026-08-27T10:00:00Z'
) => ({
  object_kind: 'merge_request',
  project: {
    id: projectId,
    path_with_namespace: 'mrh/auth-service',
    web_url: 'https://gitlab.example.org/mrh/auth-service',
  },
  object_attributes: {
    id: iid * 1000,
    iid,
    title,
    description: '',
    state,
    action,
    source_branch: 'feature/TW-142-refresh-token',
    target_branch: 'main',
    url: `https://gitlab.example.org/mrh/auth-service/-/merge_requests/${iid}`,
    author: { name: 'Alice' },
    updated_at: updatedAt,
  },
});

e2e('links commits, branches and merge requests to tasks', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);

  const connectionId = await setupConnection(workspace.id);
  const db = app.get(PrismaClient);

  await sendWebhook(
    connectionId,
    pushPayload(1, 'refs/heads/feature/TW-142-refresh-token', [
      {
        id: 'a83f1d2c71',
        title: 'Fix refresh token race',
        message: 'fix(auth): TW-142 refresh token',
      },
    ])
  );
  await processWebhookJobs();

  await sendWebhook(
    connectionId,
    mrPayload(1, 318, 'open', 'opened', 'Fix refresh token handling [TW-142]')
  );
  await processWebhookJobs();

  t.true((await getLinkCount(db, workspace.id, 'TW-142')) >= 3);

  const result = await app.gql({
    query: trackWorkTaskDevelopmentQuery,
    variables: { workspaceId: workspace.id, taskKey: 'TW-142' },
  });

  const development = result.trackWorkTaskDevelopment;
  t.is(development.commits.length, 1);
  t.is(development.commits[0].externalId, 'a83f1d2c71');
  t.is(development.commits[0].shortSha, 'a83f1d2');
  t.is(development.commits[0].branch, 'feature/TW-142-refresh-token');

  t.is(development.branches.length, 1);
  t.is(development.branches[0].name, 'feature/TW-142-refresh-token');

  t.is(development.mergeRequests.length, 1);
  t.is(development.mergeRequests[0].iid, '318');
  t.is(development.mergeRequests[0].status, 'open');
});

e2e(
  'does not duplicate links when the same webhook is delivered repeatedly',
  async t => {
    const owner = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });
    await app.login(owner);

    const connectionId = await setupConnection(workspace.id);
    const db = app.get(PrismaClient);

    const payload = pushPayload(1, 'refs/heads/main', [
      {
        id: 'b91ec33aa',
        title: 'Add regression tests',
        message: 'test: TW-151 add regression tests',
      },
    ]);

    await sendWebhook(connectionId, payload);
    await sendWebhook(connectionId, payload);
    await sendWebhook(connectionId, payload);
    await processWebhookJobs();

    t.true((await getLinkCount(db, workspace.id, 'TW-151')) >= 1);

    const links = await db.developmentTaskLink.findMany({
      where: { workspaceId: workspace.id, taskKey: 'TW-151' },
    });

    t.is(links.length, 1);

    const events = await db.developmentWebhookEvent.count({
      where: { connectionId },
    });

    t.is(events, 1);
  }
);

e2e('updates merge request status without creating duplicates', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);

  const connectionId = await setupConnection(workspace.id);
  const db = app.get(PrismaClient);

  await sendWebhook(
    connectionId,
    mrPayload(1, 319, 'open', 'opened', 'TW-142 MR')
  );
  await processWebhookJobs();
  await sendWebhook(
    connectionId,
    mrPayload(1, 319, 'merge', 'merged', 'TW-142 MR', '2026-08-27T11:00:00Z')
  );
  await processWebhookJobs();

  const link = await db.developmentTaskLink.findFirst({
    where: {
      workspaceId: workspace.id,
      taskKey: 'TW-142',
      entityType: 'merge_request',
    },
  });

  t.is(link?.status, 'merged');

  const links = await db.developmentTaskLink.findMany({
    where: {
      workspaceId: workspace.id,
      taskKey: 'TW-142',
      entityType: 'merge_request',
    },
  });

  t.is(links.length, 1);
  t.is(links[0].status, 'merged');
});

e2e('ignores webhooks for untracked repositories', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);

  const connectionId = await setupConnection(workspace.id);
  const db = app.get(PrismaClient);

  await sendWebhook(
    connectionId,
    pushPayload(999, 'refs/heads/main', [
      {
        id: 'deadbeef',
        title: 'Untracked repo',
        message: 'fix: TW-142 in untracked repo',
      },
    ])
  );

  await processWebhookJobs();

  const processed = await db.developmentWebhookEvent.count({
    where: { connectionId },
  });

  t.true(processed >= 1);

  const links = await db.developmentTaskLink.count({
    where: { workspaceId: workspace.id, taskKey: 'TW-142' },
  });

  t.is(links, 0);
});

e2e('keeps development data isolated across workspaces', async t => {
  const ownerA = await app.create(Mockers.User);
  const workspaceA = await app.create(Mockers.Workspace, {
    owner: { id: ownerA.id },
  });
  const ownerB = await app.create(Mockers.User);
  const workspaceB = await app.create(Mockers.Workspace, {
    owner: { id: ownerB.id },
  });

  await app.login(ownerA);
  const connectionId = await setupConnection(workspaceA.id);
  const db = app.get(PrismaClient);

  await sendWebhook(
    connectionId,
    pushPayload(1, 'refs/heads/main', [
      {
        id: 'cafe1234',
        title: 'Isolated',
        message: 'fix: TW-142 isolated',
      },
    ])
  );

  await processWebhookJobs();

  t.true((await getLinkCount(db, workspaceA.id, 'TW-142')) >= 1);

  await app.login(ownerB);

  const result = await app.gql({
    query: trackWorkTaskDevelopmentQuery,
    variables: { workspaceId: workspaceB.id, taskKey: 'TW-142' },
  });

  t.is(result.trackWorkTaskDevelopment.commits.length, 0);
  t.is(result.trackWorkTaskDevelopment.branches.length, 0);
  t.is(result.trackWorkTaskDevelopment.mergeRequests.length, 0);
});

e2e('development info requires workspace access', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  const outsider = await app.create(Mockers.User);

  await app.login(outsider);

  await t.throwsAsync(() =>
    app.gql({
      query: trackWorkTaskDevelopmentQuery,
      variables: { workspaceId: workspace.id, taskKey: 'TW-142' },
    })
  );
});
