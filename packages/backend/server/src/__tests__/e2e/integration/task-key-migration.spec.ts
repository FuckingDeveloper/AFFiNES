import { PrismaClient } from '@prisma/client';

import {
  createDevelopmentIntegrationMutation,
  importDevelopmentRepositoryMutation,
  migrateDevelopmentTaskKeysMutation,
  trackWorkActivityQuery,
  trackWorkTaskDevelopmentQuery,
} from '@affine/graphql';
import { WorkspaceRole } from '../../../models';
import { app, e2e, Mockers } from '../test';

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

const pushWithKey = (sha: string, message: string) => ({
  object_kind: 'push',
  ref: 'refs/heads/main',
  project: {
    id: 1,
    path_with_namespace: 'mrh/auth-service',
    web_url: 'https://gitlab.example.org/mrh/auth-service',
  },
  commits: [
    {
      id: sha,
      title: message,
      message,
      author_name: 'Alice',
    },
  ],
});

e2e('migrates task keys when the workspace prefix changes', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);

  const connectionId = await setupGitlab(workspace.id);

  await sendWebhook(connectionId, pushWithKey('aaa111', 'fix: TASK-142 token'));
  await processWebhookJobs();

  const db = app.get(PrismaClient);
  t.is(
    await db.developmentTaskLink.count({
      where: { workspaceId: workspace.id, taskKey: 'TASK-142' },
    }),
    1
  );

  const migration = await app.gql({
    query: migrateDevelopmentTaskKeysMutation,
    variables: {
      workspaceId: workspace.id,
      fromPrefix: 'TASK',
      toPrefix: 'JIRA',
    },
  });

  t.is(migration.migrateDevelopmentTaskKeys.migrated, 1);
  t.is(migration.migrateDevelopmentTaskKeys.skipped, 0);

  t.is(
    await db.developmentTaskLink.count({
      where: { workspaceId: workspace.id, taskKey: 'TASK-142' },
    }),
    0
  );

  const result = await app.gql({
    query: trackWorkTaskDevelopmentQuery,
    variables: { workspaceId: workspace.id, taskKey: 'JIRA-142' },
  });

  t.is(result.trackWorkTaskDevelopment.commits.length, 1);
  t.is(result.trackWorkTaskDevelopment.commits[0].externalId, 'aaa111');

  const activity = await app.gql({
    query: trackWorkActivityQuery,
    variables: { workspaceId: workspace.id, taskKey: 'JIRA-142', first: 10 },
  });

  t.is(activity.trackWorkActivity.items.length, 1);
});

e2e('skips links that collide with the target prefix', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);

  const connectionId = await setupGitlab(workspace.id);

  await sendWebhook(
    connectionId,
    pushWithKey('bbb222', 'fix: TASK-142 and JIRA-142 token')
  );
  await processWebhookJobs();

  const db = app.get(PrismaClient);

  const migration = await app.gql({
    query: migrateDevelopmentTaskKeysMutation,
    variables: {
      workspaceId: workspace.id,
      fromPrefix: 'TASK',
      toPrefix: 'JIRA',
    },
  });

  t.is(migration.migrateDevelopmentTaskKeys.migrated, 0);
  t.is(migration.migrateDevelopmentTaskKeys.skipped, 1);

  t.is(
    await db.developmentTaskLink.count({
      where: { workspaceId: workspace.id, taskKey: 'TASK-142' },
    }),
    1
  );
  t.is(
    await db.developmentTaskLink.count({
      where: { workspaceId: workspace.id, taskKey: 'JIRA-142' },
    }),
    1
  );
});

e2e('rejects invalid prefixes and non-admins', async t => {
  const owner = await app.create(Mockers.User);
  const member = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
    permissions: {
      create: [
        {
          userId: member.id,
          type: WorkspaceRole.Collaborator,
          status: 'Accepted',
        },
      ],
    },
  });

  await app.login(owner);

  await t.throwsAsync(() =>
    app.gql({
      query: migrateDevelopmentTaskKeysMutation,
      variables: {
        workspaceId: workspace.id,
        fromPrefix: 'TA',
        toPrefix: 'TW',
      },
    })
  );

  await t.throwsAsync(() =>
    app.gql({
      query: migrateDevelopmentTaskKeysMutation,
      variables: {
        workspaceId: workspace.id,
        fromPrefix: 'TASK',
        toPrefix: 'TASK',
      },
    })
  );

  await app.login(member);

  await t.throwsAsync(() =>
    app.gql({
      query: migrateDevelopmentTaskKeysMutation,
      variables: {
        workspaceId: workspace.id,
        fromPrefix: 'TASK',
        toPrefix: 'JIRA',
      },
    })
  );
});
