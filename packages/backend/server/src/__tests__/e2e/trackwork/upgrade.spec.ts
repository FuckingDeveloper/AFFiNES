import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import {
  allocateTrackWorkTaskMutation,
  syncTrackWorkTasksMutation,
  trackWorkDocumentBacklinksQuery,
  trackWorkTaskQuery,
} from '@affine/graphql';
import { app, e2e, Mockers } from '../test';

// The pre-policy fixture covers the server-persisted TrackWork state that
// migrations must preserve: registry rows (tasks/numbers/keys), task/document
// links, and development integration associations. Workspace Task Tracker
// board/stage configuration lives in client-synced workspace updates, which
// server migrations never touch; its readability is covered by the frontend
// legacy JSON-string property tests in task-tracker/config.spec.ts.

e2e(
  'preserves legacy registry and development data through the migration path',
  async t => {
    const owner = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });
    await app.login(owner);
    const db = app.get(PrismaClient);

    const legacyConnectionId = `legacy-connection-${randomUUID()}`;
    const legacyRepositoryId = `legacy-repository-${randomUUID()}`;
    const legacyTaskIds = [
      `legacy-task-${randomUUID()}`,
      `legacy-task-${randomUUID()}`,
      `legacy-task-${randomUUID()}`,
    ];

    await db.trackWorkTask.createMany({
      data: [
        {
          id: legacyTaskIds[0],
          workspaceId: workspace.id,
          docId: 'legacy-doc-1',
          taskKey: 'TW-1',
          number: 1,
          linksInitialized: false,
          createdById: owner.id,
        },
        {
          id: legacyTaskIds[1],
          workspaceId: workspace.id,
          docId: 'legacy-doc-2',
          taskKey: 'TW-2',
          number: 2,
          linksInitialized: false,
          createdById: owner.id,
        },
        {
          id: legacyTaskIds[2],
          workspaceId: workspace.id,
          docId: 'legacy-doc-3',
          taskKey: 'TW-3',
          number: 3,
          linksInitialized: false,
          createdById: owner.id,
        },
      ],
    });

    await db.trackWorkDocumentLink.createMany({
      data: [
        {
          workspaceId: workspace.id,
          taskId: legacyTaskIds[0],
          documentId: 'related-a',
          createdById: owner.id,
        },
        {
          workspaceId: workspace.id,
          taskId: legacyTaskIds[0],
          documentId: 'related-b',
          createdById: owner.id,
        },
      ],
    });

    await db.developmentIntegrationConnection.create({
      data: {
        id: legacyConnectionId,
        workspaceId: workspace.id,
        provider: 'gitlab',
        name: 'Legacy GitLab',
        baseUrl: 'https://gitlab.example.org',
        tokenCipher: 'cipher:legacy-fixture-not-a-secret',
        webhookSecretCipher: 'cipher:legacy-fixture-not-a-secret',
        enabled: true,
        createdById: owner.id,
      },
    });
    await db.developmentRepository.create({
      data: {
        id: legacyRepositoryId,
        connectionId: legacyConnectionId,
        externalId: '1',
        name: 'legacy-repo',
        fullName: 'org/legacy-repo',
        webUrl: 'https://gitlab.example.org/org/legacy-repo',
        enabled: true,
      },
    });
    await db.developmentTaskLink.create({
      data: {
        workspaceId: workspace.id,
        connectionId: legacyConnectionId,
        repositoryId: legacyRepositoryId,
        taskKey: 'TW-1',
        entityType: 'commit.pushed',
        externalId: 'legacy-sha-0001',
        url: 'https://gitlab.example.org/org/legacy-repo/-/commit/legacy-sha-0001',
        title: 'fix: TW-1 legacy state',
        metadata: {},
      },
    });

    const synced = await app.gql({
      query: syncTrackWorkTasksMutation,
      variables: {
        input: {
          workspaceId: workspace.id,
          prefix: 'TW',
          tasks: [
            { docId: 'legacy-doc-4', taskKey: 'TW-4', relatedDocumentIds: [] },
            { docId: 'legacy-doc-5', taskKey: 'TW-4', relatedDocumentIds: [] },
          ],
        },
      },
    });
    // the conflicted duplicate is skipped and the sync allocates a fresh
    // key for its document (existing sync semantics, see registry.spec.ts)
    const importedKeys = synced.syncTrackWorkTasks.map(
      (task: { taskKey: string }) => task.taskKey
    );
    t.deepEqual(importedKeys, ['TW-4', 'TW-5']);

    const allocated = await app.gql({
      query: allocateTrackWorkTaskMutation,
      variables: {
        input: {
          workspaceId: workspace.id,
          docId: 'new-doc-1',
          prefix: 'TW',
          relatedDocumentIds: [],
          legacyTasks: [],
        },
      },
    });
    t.is(allocated.allocateTrackWorkTask.taskKey, 'TW-6');
    t.is(allocated.allocateTrackWorkTask.number, 6);

    const read = await app.gql({
      query: trackWorkTaskQuery,
      variables: { workspaceId: workspace.id, taskKey: 'TW-1' },
    });
    t.truthy(read.trackWorkTask);
    t.is(read.trackWorkTask?.docId, 'legacy-doc-1');
    t.is(read.trackWorkTask?.number, 1);

    const backlinks = await app.gql({
      query: trackWorkDocumentBacklinksQuery,
      variables: { workspaceId: workspace.id, documentId: 'related-a' },
    });
    t.deepEqual(
      backlinks.trackWorkDocumentBacklinks.map(
        (task: { taskKey: string }) => task.taskKey
      ),
      ['TW-1']
    );

    t.is(
      await db.trackWorkTask.count({ where: { workspaceId: workspace.id } }),
      6
    );
    t.is(
      await db.trackWorkDocumentLink.count({
        where: { workspaceId: workspace.id },
      }),
      2
    );
    t.is(
      await db.developmentTaskLink.count({
        where: { workspaceId: workspace.id, taskKey: 'TW-1' },
      }),
      1
    );
    const preserved = await db.trackWorkTask.findFirst({
      where: { id: legacyTaskIds[0] },
    });
    t.is(preserved?.taskKey, 'TW-1');
    t.is(preserved?.number, 1);
  }
);

e2e('migration path is idempotent on current data', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);
  const db = app.get(PrismaClient);

  const allocated = await app.gql({
    query: allocateTrackWorkTaskMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        docId: 'current-doc-1',
        prefix: 'TW',
        relatedDocumentIds: [],
        legacyTasks: [],
      },
    },
  });
  t.is(allocated.allocateTrackWorkTask.taskKey, 'TW-1');

  // re-importing the same legacy association must not duplicate rows
  for (let i = 0; i < 2; i++) {
    const synced = await app.gql({
      query: syncTrackWorkTasksMutation,
      variables: {
        input: {
          workspaceId: workspace.id,
          prefix: 'TW',
          tasks: [
            {
              docId: 'current-doc-1',
              taskKey: 'TW-1',
              relatedDocumentIds: [],
            },
          ],
        },
      },
    });
    t.deepEqual(
      synced.syncTrackWorkTasks.map(
        (task: { taskKey: string }) => task.taskKey
      ),
      ['TW-1']
    );
  }

  // re-allocating the same document returns the existing immutable task
  const retried = await app.gql({
    query: allocateTrackWorkTaskMutation,
    variables: {
      input: {
        workspaceId: workspace.id,
        docId: 'current-doc-1',
        prefix: 'TW',
        relatedDocumentIds: [],
        legacyTasks: [],
      },
    },
  });
  t.is(retried.allocateTrackWorkTask.taskKey, 'TW-1');

  t.is(
    await db.trackWorkTask.count({ where: { workspaceId: workspace.id } }),
    1
  );
});
