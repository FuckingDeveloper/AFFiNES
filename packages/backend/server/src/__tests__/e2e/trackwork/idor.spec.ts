import { PrismaClient } from '@prisma/client';

import {
  allocateTrackWorkTaskMutation,
  createDevelopmentBranchMutation,
  createDevelopmentIntegrationMutation,
  createDevelopmentMergeRequestMutation,
  deleteDevelopmentIntegrationMutation,
  developmentIntegrationsQuery,
  developmentRepositoriesMutation,
  importDevelopmentRepositoryMutation,
  refreshDevelopmentPipelinesMutation,
  rotateDevelopmentIntegrationCredentialsMutation,
  setDevelopmentRepositoryEnabledMutation,
  setTrackWorkTaskDocumentLinksMutation,
  syncTrackWorkTasksMutation,
  testDevelopmentIntegrationMutation,
  trackWorkActivityQuery,
  trackWorkDocumentBacklinksQuery,
  trackWorkTaskDevelopmentQuery,
  trackWorkTaskQuery,
  updateDevelopmentIntegrationMutation,
} from '@affine/graphql';

import { WorkspaceRole } from '../../../models';
import { app, e2e, Mockers } from '../test';

const denied = () => ({ message: /do not have permission to/ });

const notFound = () => ({ message: /not found/i });

const allocate = (workspaceId: string, docId: string, prefix = 'TW') =>
  app.gql({
    query: allocateTrackWorkTaskMutation,
    variables: {
      input: {
        workspaceId,
        docId,
        prefix,
        relatedDocumentIds: [],
        legacyTasks: [],
      },
    },
  });

const createConnection = (workspaceId: string) =>
  app.gql({
    query: createDevelopmentIntegrationMutation,
    variables: {
      input: {
        workspaceId,
        provider: 'gitlab',
        name: 'GitLab',
        baseUrl: 'https://gitlab.example.org',
        token: 'glpat-secret-token',
        webhookSecret: 'super-secret-webhook',
      },
    },
  });

e2e('task registry objects are workspace-isolated', async t => {
  const ownerA = await app.create(Mockers.User);
  const workspaceA = await app.create(Mockers.Workspace, {
    owner: { id: ownerA.id },
  });
  const ownerB = await app.create(Mockers.User);
  const workspaceB = await app.create(Mockers.Workspace, {
    owner: { id: ownerB.id },
  });
  const outsider = await app.create(Mockers.User);

  await app.login(ownerA);
  await allocate(workspaceA.id, 'task-a-1');
  await app.login(ownerB);
  await allocate(workspaceB.id, 'task-b-1');
  const taskB = await allocate(workspaceB.id, 'task-b-2');
  const taskBKey = taskB.allocateTrackWorkTask.taskKey;

  await app.login(ownerA);
  const inA = await app.gql({
    query: trackWorkTaskQuery,
    variables: { workspaceId: workspaceA.id, taskKey: 'TW-1' },
  });
  t.is(inA.trackWorkTask?.docId, 'task-a-1');

  const crossResolve = await app.gql({
    query: trackWorkTaskQuery,
    variables: { workspaceId: workspaceA.id, taskKey: taskBKey },
  });
  t.is(crossResolve.trackWorkTask, null);

  await app.login(outsider);
  await t.throwsAsync(
    app.gql({
      query: trackWorkTaskQuery,
      variables: { workspaceId: workspaceB.id, taskKey: 'TW-1' },
    }),
    denied()
  );
  await t.throwsAsync(
    app.gql({
      query: trackWorkDocumentBacklinksQuery,
      variables: { workspaceId: workspaceB.id, documentId: 'task-b-1' },
    }),
    denied()
  );
});

e2e(
  'task link writes are doc-scoped and cannot target foreign tasks',
  async t => {
    const ownerA = await app.create(Mockers.User);
    const workspaceA = await app.create(Mockers.Workspace, {
      owner: { id: ownerA.id },
    });
    const ownerB = await app.create(Mockers.User);
    const workspaceB = await app.create(Mockers.Workspace, {
      owner: { id: ownerB.id },
    });
    const collaboratorA = await app.create(Mockers.User);
    await app.create(Mockers.WorkspaceUser, {
      userId: collaboratorA.id,
      workspaceId: workspaceA.id,
      type: WorkspaceRole.Collaborator,
    });
    const outsider = await app.create(Mockers.User);

    await app.login(ownerA);
    const taskA = await allocate(workspaceA.id, 'task-a-1');
    const taskADocId = taskA.allocateTrackWorkTask.docId;

    await app.login(ownerB);
    const taskB = await allocate(workspaceB.id, 'task-b-1');
    const taskBDocId = taskB.allocateTrackWorkTask.docId;

    await app.login(ownerA);
    const updated = await app.gql({
      query: setTrackWorkTaskDocumentLinksMutation,
      variables: {
        input: {
          workspaceId: workspaceA.id,
          taskDocId: taskADocId,
          documentIds: ['own-doc-1'],
        },
      },
    });
    t.deepEqual(updated.setTrackWorkTaskDocumentLinks.relatedDocumentIds, [
      'own-doc-1',
    ]);

    await t.throwsAsync(
      app.gql({
        query: setTrackWorkTaskDocumentLinksMutation,
        variables: {
          input: {
            workspaceId: workspaceA.id,
            taskDocId: taskBDocId,
            documentIds: [],
          },
        },
      })
    );

    await app.login(collaboratorA);
    const byCollaborator = await app.gql({
      query: setTrackWorkTaskDocumentLinksMutation,
      variables: {
        input: {
          workspaceId: workspaceA.id,
          taskDocId: taskADocId,
          documentIds: ['own-doc-2'],
        },
      },
    });
    t.deepEqual(
      byCollaborator.setTrackWorkTaskDocumentLinks.relatedDocumentIds,
      ['own-doc-2']
    );

    await app.login(outsider);
    await t.throwsAsync(
      app.gql({
        query: setTrackWorkTaskDocumentLinksMutation,
        variables: {
          input: {
            workspaceId: workspaceA.id,
            taskDocId: taskADocId,
            documentIds: [],
          },
        },
      }),
      denied()
    );
  }
);

e2e('task writes require TrackWork.Write in the target workspace', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  const admin = await app.create(Mockers.User);
  await app.create(Mockers.WorkspaceUser, {
    userId: admin.id,
    workspaceId: workspace.id,
    type: WorkspaceRole.Admin,
  });
  const collaborator = await app.create(Mockers.User);
  await app.create(Mockers.WorkspaceUser, {
    userId: collaborator.id,
    workspaceId: workspace.id,
    type: WorkspaceRole.Collaborator,
  });
  const outsider = await app.create(Mockers.User);
  const otherWorkspace = await app.create(Mockers.Workspace, {
    owner: { id: outsider.id },
  });

  await app.login(collaborator);
  const byCollaborator = await allocate(workspace.id, 'task-c-1');
  t.is(byCollaborator.allocateTrackWorkTask.taskKey, 'TW-1');

  await app.login(admin);
  const byAdmin = await allocate(workspace.id, 'task-c-2');
  t.is(byAdmin.allocateTrackWorkTask.taskKey, 'TW-2');

  await app.login(collaborator);
  await t.throwsAsync(allocate(otherWorkspace.id, 'task-x-1'), denied());

  await app.login(outsider);
  await t.throwsAsync(allocate(workspace.id, 'task-x-2'), denied());

  await t.throwsAsync(
    app.gql({
      query: syncTrackWorkTasksMutation,
      variables: {
        input: {
          workspaceId: workspace.id,
          prefix: 'TW',
          tasks: [
            { docId: 'legacy-x', taskKey: 'TW-9', relatedDocumentIds: [] },
          ],
        },
      },
    }),
    denied()
  );
});

e2e('integration reads are owner-scoped', async t => {
  const ownerA = await app.create(Mockers.User);
  const workspaceA = await app.create(Mockers.Workspace, {
    owner: { id: ownerA.id },
  });
  const adminA = await app.create(Mockers.User);
  await app.create(Mockers.WorkspaceUser, {
    userId: adminA.id,
    workspaceId: workspaceA.id,
    type: WorkspaceRole.Admin,
  });

  await app.login(ownerA);
  const created = await createConnection(workspaceA.id);
  t.truthy(created.createDevelopmentIntegration.id);

  await app.login(adminA);
  await t.throwsAsync(
    app.gql({
      query: developmentIntegrationsQuery,
      variables: { workspaceId: workspaceA.id },
    }),
    denied()
  );

  await app.login(ownerA);
  const listed = await app.gql({
    query: developmentIntegrationsQuery,
    variables: { workspaceId: workspaceA.id },
  });
  t.is(listed.workspace.developmentIntegrations.length, 1);
});

e2e('integration configuration cannot cross workspaces', async t => {
  const ownerA = await app.create(Mockers.User);
  const ownerB = await app.create(Mockers.User);
  const workspaceB = await app.create(Mockers.Workspace, {
    owner: { id: ownerB.id },
  });

  await app.login(ownerB);
  const created = await createConnection(workspaceB.id);
  const connectionId = created.createDevelopmentIntegration.id;
  const imported = await app.gql({
    query: importDevelopmentRepositoryMutation,
    variables: {
      input: {
        connectionId,
        externalId: '1',
        name: 'repo-b',
        fullName: 'org/repo-b',
        webUrl: 'https://gitlab.example.org/org/repo-b',
      },
    },
  });
  const repositoryId = imported.importDevelopmentRepository.id;

  await app.login(ownerA);
  await t.throwsAsync(
    app.gql({
      query: updateDevelopmentIntegrationMutation,
      variables: {
        input: {
          id: connectionId,
          name: 'Hijacked',
          baseUrl: 'https://evil.example',
          enabled: true,
        },
      },
    }),
    denied()
  );
  await t.throwsAsync(
    app.gql({
      query: rotateDevelopmentIntegrationCredentialsMutation,
      variables: {
        input: { id: connectionId, token: 'glpat-stolen', webhookSecret: 'x' },
      },
    }),
    denied()
  );
  await t.throwsAsync(
    app.gql({
      query: deleteDevelopmentIntegrationMutation,
      variables: { connectionId },
    }),
    denied()
  );
  await t.throwsAsync(
    app.gql({
      query: testDevelopmentIntegrationMutation,
      variables: { connectionId },
    }),
    denied()
  );
  await t.throwsAsync(
    app.gql({
      query: importDevelopmentRepositoryMutation,
      variables: {
        input: {
          connectionId,
          externalId: '2',
          name: 'hijack',
          fullName: 'org/hijack',
          webUrl: 'https://gitlab.example.org/org/hijack',
        },
      },
    }),
    denied()
  );
  await t.throwsAsync(
    app.gql({
      query: setDevelopmentRepositoryEnabledMutation,
      variables: { repositoryId, enabled: false },
    }),
    denied()
  );

  const db = app.get(PrismaClient);
  const connection = await db.developmentIntegrationConnection.findUnique({
    where: { id: connectionId },
  });
  t.is(connection?.name, 'GitLab');
  t.is(
    await db.developmentRepository.count({ where: { id: repositoryId } }),
    1
  );
});

e2e(
  'SCM actions cannot cross workspaces or compose foreign objects',
  async t => {
    const ownerA = await app.create(Mockers.User);
    const workspaceA = await app.create(Mockers.Workspace, {
      owner: { id: ownerA.id },
    });
    const ownerB = await app.create(Mockers.User);
    const workspaceB = await app.create(Mockers.Workspace, {
      owner: { id: ownerB.id },
    });

    await app.login(ownerA);
    const connectionA = await createConnection(workspaceA.id);
    const connectionAId = connectionA.createDevelopmentIntegration.id;
    await app.gql({
      query: importDevelopmentRepositoryMutation,
      variables: {
        input: {
          connectionId: connectionAId,
          externalId: '1',
          name: 'repo-a',
          fullName: 'org/repo-a',
          webUrl: 'https://gitlab.example.org/org/repo-a',
        },
      },
    });

    await app.login(ownerB);
    const connectionB = await createConnection(workspaceB.id);
    const connectionBId = connectionB.createDevelopmentIntegration.id;
    await app.gql({
      query: importDevelopmentRepositoryMutation,
      variables: {
        input: {
          connectionId: connectionBId,
          externalId: '2',
          name: 'repo-b',
          fullName: 'org/repo-b',
          webUrl: 'https://gitlab.example.org/org/repo-b',
        },
      },
    });
    await allocate(workspaceB.id, 'task-b-1');

    await app.login(ownerA);
    for (const fn of [
      () =>
        app.gql({
          query: createDevelopmentBranchMutation,
          variables: {
            input: {
              connectionId: connectionBId,
              repositoryId: '2',
              baseBranch: 'main',
              name: 'feature/x',
              taskKey: 'TW-1',
            },
          },
        }),
      () =>
        app.gql({
          query: createDevelopmentMergeRequestMutation,
          variables: {
            input: {
              connectionId: connectionBId,
              repositoryId: '2',
              sourceBranch: 'feature/x',
              targetBranch: 'main',
              title: 'Hijack MR',
              taskKey: 'TW-1',
            },
          },
        }),
      () =>
        app.gql({
          query: refreshDevelopmentPipelinesMutation,
          variables: { connectionId: connectionBId },
        }),
      () =>
        app.gql({
          query: developmentRepositoriesMutation,
          variables: { connectionId: connectionBId },
        }),
    ]) {
      await t.throwsAsync(fn(), denied());
    }

    await t.throwsAsync(
      app.gql({
        query: createDevelopmentBranchMutation,
        variables: {
          input: {
            connectionId: connectionAId,
            repositoryId: '2',
            baseBranch: 'main',
            name: 'feature/x',
            taskKey: 'TW-1',
          },
        },
      }),
      notFound()
    );

    await app.login(ownerB);
    await t.throwsAsync(
      app.gql({
        query: createDevelopmentBranchMutation,
        variables: {
          input: {
            connectionId: connectionBId,
            repositoryId: 'missing',
            baseBranch: 'main',
            name: 'feature/x',
            taskKey: 'TW-1',
          },
        },
      }),
      notFound()
    );
  }
);

e2e('development reads are workspace-scoped', async t => {
  const ownerA = await app.create(Mockers.User);
  const workspaceA = await app.create(Mockers.Workspace, {
    owner: { id: ownerA.id },
  });
  const ownerB = await app.create(Mockers.User);
  const workspaceB = await app.create(Mockers.Workspace, {
    owner: { id: ownerB.id },
  });
  const outsider = await app.create(Mockers.User);

  await app.login(ownerA);
  await allocate(workspaceA.id, 'task-a-1');

  await app.login(ownerB);
  const taskB = await allocate(workspaceB.id, 'task-b-1');
  const taskBKey = taskB.allocateTrackWorkTask.taskKey;

  await app.login(ownerA);
  const dev = await app.gql({
    query: trackWorkTaskDevelopmentQuery,
    variables: { workspaceId: workspaceA.id, taskKey: 'TW-1' },
  });
  t.deepEqual(dev.trackWorkTaskDevelopment.commits, []);

  await t.throwsAsync(
    app.gql({
      query: trackWorkTaskDevelopmentQuery,
      variables: { workspaceId: workspaceB.id, taskKey: taskBKey },
    }),
    denied()
  );
  await t.throwsAsync(
    app.gql({
      query: trackWorkActivityQuery,
      variables: { workspaceId: workspaceB.id, taskKey: taskBKey },
    }),
    denied()
  );

  const activity = await app.gql({
    query: trackWorkActivityQuery,
    variables: { workspaceId: workspaceA.id },
  });
  t.true(Array.isArray(activity.trackWorkActivity.items));

  await app.login(outsider);
  await t.throwsAsync(
    app.gql({
      query: trackWorkActivityQuery,
      variables: { workspaceId: workspaceA.id },
    }),
    denied()
  );
});
