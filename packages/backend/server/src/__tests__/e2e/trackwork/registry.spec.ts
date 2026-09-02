import {
  allocateTrackWorkTaskMutation,
  setTrackWorkTaskDocumentLinksMutation,
  syncTrackWorkTasksMutation,
  trackWorkDocumentBacklinksQuery,
  trackWorkTaskQuery,
} from '@affine/graphql';

import { app, e2e, Mockers } from '../test';

e2e('allocates immutable workspace-scoped task keys atomically', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);

  const allocate = (docId: string, prefix = 'TASK') =>
    app.gql({
      query: allocateTrackWorkTaskMutation,
      variables: {
        input: {
          workspaceId: workspace.id,
          docId,
          prefix,
          relatedDocumentIds: [],
          legacyTasks: [],
        },
      },
    });

  const [first, second] = await Promise.all([
    allocate('task-doc-a'),
    allocate('task-doc-b'),
  ]);
  const issued = [
    first.allocateTrackWorkTask.taskKey,
    second.allocateTrackWorkTask.taskKey,
  ].sort();
  t.deepEqual(issued, ['TASK-1', 'TASK-2']);

  const retried = await allocate('task-doc-a', 'JIRA');
  t.is(
    retried.allocateTrackWorkTask.taskKey,
    first.allocateTrackWorkTask.taskKey
  );

  const afterPrefixChange = await allocate('task-doc-c', 'JIRA');
  t.is(afterPrefixChange.allocateTrackWorkTask.taskKey, 'JIRA-3');
});

e2e(
  'imports legacy tasks and assigns conflicts through the registry',
  async t => {
    const owner = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });
    await app.login(owner);

    const result = await app.gql({
      query: syncTrackWorkTasksMutation,
      variables: {
        input: {
          workspaceId: workspace.id,
          prefix: 'TASK',
          tasks: [
            {
              docId: 'legacy-a',
              taskKey: 'TASK-7',
              relatedDocumentIds: ['source-a'],
            },
            {
              docId: 'legacy-b',
              taskKey: 'TASK-7',
              relatedDocumentIds: [],
            },
            {
              docId: 'legacy-c',
              taskKey: '',
              relatedDocumentIds: [],
            },
          ],
        },
      },
    });

    t.deepEqual(
      result.syncTrackWorkTasks.map(task => task.taskKey),
      ['TASK-7', 'TASK-8', 'TASK-9']
    );
    t.deepEqual(result.syncTrackWorkTasks[0]?.relatedDocumentIds, ['source-a']);
  }
);

e2e('stores document links and exposes task backlinks', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);

  const allocated = await app.gql({
    query: allocateTrackWorkTaskMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        docId: 'task-doc',
        prefix: 'TASK',
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
        taskDocId: 'task-doc',
        documentIds: ['source-doc', 'source-doc'],
      },
    },
  });
  t.deepEqual(updated.setTrackWorkTaskDocumentLinks.relatedDocumentIds, [
    'source-doc',
  ]);

  const backlinks = await app.gql({
    query: trackWorkDocumentBacklinksQuery,
    variables: { workspaceId: workspace.id, documentId: 'source-doc' },
  });
  t.is(backlinks.trackWorkDocumentBacklinks.length, 1);
  t.is(backlinks.trackWorkDocumentBacklinks[0]?.docId, 'task-doc');

  const byKey = await app.gql({
    query: trackWorkTaskQuery,
    variables: {
      workspaceId: workspace.id,
      taskKey: allocated.allocateTrackWorkTask.taskKey.toLowerCase(),
    },
  });
  t.is(byKey.trackWorkTask?.docId, 'task-doc');
});
