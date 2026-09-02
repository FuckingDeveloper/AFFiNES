import { PrismaClient } from '@prisma/client';

import {
  adminAuditLogsQuery,
  allocateTrackWorkTaskMutation,
  createDevelopmentIntegrationMutation,
  deleteDevelopmentIntegrationMutation,
  importDevelopmentRepositoryMutation,
  rotateDevelopmentIntegrationCredentialsMutation,
  setTrackWorkTaskDocumentLinksMutation,
  syncTrackWorkTasksMutation,
} from '@affine/graphql';

import { WorkspaceRole } from '../../../models';
import { app, e2e, Mockers } from '../test';

const adminAudit = () => app.get(PrismaClient).adminAuditLog;

e2e('authorized TrackWork mutations produce durable audit events', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);

  await app.gql({
    query: allocateTrackWorkTaskMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        docId: 'audit-task-1',
        prefix: 'TW',
        relatedDocumentIds: [],
        legacyTasks: [],
      },
    },
  });

  const created = await app.gql({
    query: createDevelopmentIntegrationMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        provider: 'gitlab',
        name: 'Audited GitLab',
        baseUrl: 'https://gitlab.example.org',
        token: 'glpat-secret-token',
        webhookSecret: 'super-secret-webhook',
      },
    },
  });
  const connectionId = created.createDevelopmentIntegration.id;

  await app.gql({
    query: rotateDevelopmentIntegrationCredentialsMutation,
    variables: {
      input: {
        id: connectionId,
        token: 'glpat-rotated-token',
        webhookSecret: 'rotated-secret',
      },
    },
  });

  const rows = await adminAudit().findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: 'asc' },
  });

  t.deepEqual(
    rows.map(row => row.action),
    [
      'trackwork.task.allocate',
      'trackwork.integration.create',
      'trackwork.integration.rotate_credentials',
    ]
  );
  t.is(rows[0]?.actorId, owner.id);
  t.is(rows[0]?.actorEmail, owner.email);
  t.is(rows[0]?.workspaceId, workspace.id);
  t.is(rows[0]?.targetId, 'TW-1');
  t.deepEqual(rows[1]?.metadata, { provider: 'gitlab' });
  t.is(rows[2]?.targetId, connectionId);
});

e2e(
  'denied and cross-workspace mutations do not create success audits',
  async t => {
    const ownerA = await app.create(Mockers.User);
    const workspaceA = await app.create(Mockers.Workspace, {
      owner: { id: ownerA.id },
    });
    const ownerB = await app.create(Mockers.User);
    const workspaceB = await app.create(Mockers.Workspace, {
      owner: { id: ownerB.id },
    });
    const collaborator = await app.create(Mockers.User);
    await app.create(Mockers.WorkspaceUser, {
      userId: collaborator.id,
      workspaceId: workspaceA.id,
      type: WorkspaceRole.Collaborator,
    });

    await app.login(ownerB);
    const created = await app.gql({
      query: createDevelopmentIntegrationMutation,
      variables: {
        input: {
          workspaceId: workspaceB.id,
          provider: 'gitlab',
          name: 'B GitLab',
          baseUrl: 'https://gitlab.example.org',
          token: 'glpat-secret-token',
          webhookSecret: 'super-secret-webhook',
        },
      },
    });
    const connectionB = created.createDevelopmentIntegration.id;

    await app.login(collaborator);
    await t.throwsAsync(
      app.gql({
        query: createDevelopmentIntegrationMutation,
        variables: {
          input: {
            workspaceId: workspaceA.id,
            provider: 'gitlab',
            name: 'Denied',
            baseUrl: 'https://gitlab.example.org',
            token: 'glpat-secret-token',
            webhookSecret: 'super-secret-webhook',
          },
        },
      })
    );

    await app.login(ownerA);
    await t.throwsAsync(
      app.gql({
        query: deleteDevelopmentIntegrationMutation,
        variables: { connectionId: connectionB },
      })
    );

    t.is(
      await adminAudit().count({ where: { workspaceId: workspaceA.id } }),
      0
    );
    const workspaceBRows = await adminAudit().findMany({
      where: { workspaceId: workspaceB.id },
    });
    t.deepEqual(
      workspaceBRows.map(row => row.action),
      ['trackwork.integration.create']
    );
    t.true(workspaceBRows.every(row => row.actorId === ownerB.id));
  }
);

e2e('bulk task sync produces a single bounded audit event', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);

  const synced = await app.gql({
    query: syncTrackWorkTasksMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        prefix: 'TW',
        tasks: [
          { docId: 'bulk-1', taskKey: 'TW-1', relatedDocumentIds: [] },
          { docId: 'bulk-2', taskKey: 'TW-2', relatedDocumentIds: [] },
          { docId: 'bulk-3', taskKey: 'TW-3', relatedDocumentIds: [] },
        ],
      },
    },
  });

  t.is(synced.syncTrackWorkTasks.length, 3);
  const rows = await adminAudit().findMany({
    where: { workspaceId: workspace.id, action: 'trackwork.task.sync' },
  });
  t.is(rows.length, 1);
  t.deepEqual(rows[0]?.metadata, { taskCount: 3 });
});

e2e(
  'audit records remain after target deletion and never store secrets',
  async t => {
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
          provider: 'gitlab',
          name: 'Doomed GitLab',
          baseUrl: 'https://gitlab.example.org',
          token: 'glpat-secret-token',
          webhookSecret: 'super-secret-webhook',
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
          name: 'repo',
          fullName: 'org/repo',
          webUrl: 'https://gitlab.example.org/org/repo',
        },
      },
    });

    await app.gql({
      query: deleteDevelopmentIntegrationMutation,
      variables: { connectionId },
    });

    t.is(
      await app.get(PrismaClient).developmentIntegrationConnection.count({
        where: { id: connectionId },
      }),
      0
    );

    const rows = await adminAudit().findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: 'asc' },
    });
    const actions = rows.map(row => row.action);
    t.true(actions.includes('trackwork.integration.create'));
    t.true(actions.includes('trackwork.integration.import_repository'));
    t.true(actions.includes('trackwork.integration.delete'));
    t.true(rows.some(row => row.targetId === connectionId));

    const serialized = JSON.stringify(
      rows.map(row => ({ action: row.action, metadata: row.metadata }))
    );
    t.false(serialized.includes('glpat-'));
    t.false(serialized.includes('super-secret-webhook'));
    t.false(serialized.includes('Doomed GitLab'));
  }
);

e2e('user-authored content does not leak into audit metadata', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);

  await app.gql({
    query: allocateTrackWorkTaskMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        docId: 'leak-task-1',
        prefix: 'TW',
        relatedDocumentIds: [],
        legacyTasks: [],
      },
    },
  });

  const updated = await app.gql({
    query: setTrackWorkTaskDocumentLinksMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        taskDocId: 'leak-task-1',
        documentIds: ['sensitive-related-doc', 'other-doc'],
      },
    },
  });
  t.is(updated.setTrackWorkTaskDocumentLinks.taskKey, 'TW-1');

  const rows = await adminAudit().findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: 'asc' },
  });
  t.deepEqual(
    rows.map(row => row.action),
    ['trackwork.task.allocate', 'trackwork.task.set_links']
  );
  t.is(rows[0]?.targetId, 'TW-1');
  t.deepEqual(rows[1]?.metadata, { linkCount: 2 });
  const serialized = JSON.stringify(
    rows.map(row => ({ metadata: row.metadata, targetId: row.targetId }))
  );
  t.false(serialized.includes('sensitive-related-doc'));
  t.false(serialized.includes('other-doc'));
});

e2e('admin audit query returns TrackWork events', async t => {
  const admin = await app.create(Mockers.User, {
    feature: 'administrator',
  });
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);
  await app.gql({
    query: allocateTrackWorkTaskMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        docId: 'admin-audit-task-1',
        prefix: 'TW',
        relatedDocumentIds: [],
        legacyTasks: [],
      },
    },
  });

  await app.login(admin);
  const result = await app.gql({
    query: adminAuditLogsQuery,
    variables: { first: 50, skip: 0 },
  });
  const event = result.adminAuditLogs.find(
    (entry: { action: string }) => entry.action === 'trackwork.task.allocate'
  );
  t.truthy(event);
  t.is(event?.targetId, 'TW-1');
});
