import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import {
  allocateTrackWorkTaskMutation,
  createDevelopmentIntegrationMutation,
  importDevelopmentRepositoryMutation,
  trackWorkActivityQuery,
  trackWorkTaskDevelopmentQuery,
  trackWorkTaskQuery,
} from '@affine/graphql';

import { DocRole, WorkspaceRole } from '../../../models';
import { app, e2e, Mockers } from '../test';

const denied = () => ({ message: /do not have permission to/ });

e2e(
  'task development metadata requires Doc.Read on the task document',
  async t => {
    const owner = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });
    const member = await app.create(Mockers.User);
    await app.create(Mockers.WorkspaceUser, {
      userId: member.id,
      workspaceId: workspace.id,
      type: WorkspaceRole.Collaborator,
    });
    const db = app.get(PrismaClient);

    const restrictedDocId = 'restricted-task-doc';
    const readableDocId = 'readable-task-doc';
    await db.workspaceDoc.create({
      data: {
        workspaceId: workspace.id,
        docId: restrictedDocId,
        defaultRole: DocRole.None,
      },
    });
    await db.workspaceDoc.create({
      data: {
        workspaceId: workspace.id,
        docId: readableDocId,
        defaultRole: DocRole.Manager,
      },
    });

    await app.login(owner);
    const restricted = await app.gql({
      query: allocateTrackWorkTaskMutation,
      variables: {
        input: {
          workspaceId: workspace.id,
          docId: restrictedDocId,
          prefix: 'TW',
          relatedDocumentIds: [],
          legacyTasks: [],
        },
      },
    });
    const restrictedKey = restricted.allocateTrackWorkTask.taskKey;
    const readable = await app.gql({
      query: allocateTrackWorkTaskMutation,
      variables: {
        input: {
          workspaceId: workspace.id,
          docId: readableDocId,
          prefix: 'TW',
          relatedDocumentIds: [],
          legacyTasks: [],
        },
      },
    });
    const readableKey = readable.allocateTrackWorkTask.taskKey;

    const created = await app.gql({
      query: createDevelopmentIntegrationMutation,
      variables: {
        input: {
          workspaceId: workspace.id,
          provider: 'gitlab',
          name: 'GitLab',
          baseUrl: 'https://gitlab.example.org',
          token: 'glpat-secret-token',
          webhookSecret: 'super-secret-webhook',
        },
      },
    });
    const connectionId = created.createDevelopmentIntegration.id;
    const imported = await app.gql({
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
    const repositoryId = imported.importDevelopmentRepository.id;

    await db.developmentTaskLink.createMany({
      data: [restrictedKey, readableKey].map(taskKey => ({
        workspaceId: workspace.id,
        connectionId,
        repositoryId,
        taskKey,
        entityType: 'commit',
        externalId: `sha-${taskKey}`,
        url: `https://gitlab.example.org/org/repo/-/commit/sha-${taskKey}`,
        title: `commit for ${taskKey}`,
        metadata: { shortSha: `sha-${taskKey}` },
      })),
    });
    await db.developmentActivity.createMany({
      data: [
        {
          workspaceId: workspace.id,
          connectionId,
          taskKey: restrictedKey,
          eventType: 'commit.pushed',
          title: `secret activity for ${restrictedKey}`,
          url: 'https://gitlab.example.org/org/repo/-/commit/sha-1',
          authorName: 'secret-author',
          repositoryName: 'org/repo',
          metadata: {},
        },
        {
          workspaceId: workspace.id,
          connectionId,
          taskKey: readableKey,
          eventType: 'commit.pushed',
          title: `public activity for ${readableKey}`,
          url: 'https://gitlab.example.org/org/repo/-/commit/sha-2',
          authorName: 'public-author',
          repositoryName: 'org/repo',
          metadata: {},
        },
      ],
    });

    await app.login(member);

    await t.throwsAsync(
      app.gql({
        query: trackWorkTaskQuery,
        variables: { workspaceId: workspace.id, taskKey: restrictedKey },
      }),
      denied()
    );

    await t.throwsAsync(
      app.gql({
        query: trackWorkTaskDevelopmentQuery,
        variables: { workspaceId: workspace.id, taskKey: restrictedKey },
      }),
      denied()
    );

    await t.throwsAsync(
      app.gql({
        query: trackWorkActivityQuery,
        variables: { workspaceId: workspace.id, taskKey: restrictedKey },
      }),
      denied()
    );

    const unfiltered = await app.gql({
      query: trackWorkActivityQuery,
      variables: { workspaceId: workspace.id },
    });
    const keys = unfiltered.trackWorkActivity.items.map(
      (item: { taskKey: string }) => item.taskKey
    );
    t.deepEqual(keys, [readableKey]);

    const readableDev = await app.gql({
      query: trackWorkTaskDevelopmentQuery,
      variables: { workspaceId: workspace.id, taskKey: readableKey },
    });
    t.is(readableDev.trackWorkTaskDevelopment.commits.length, 1);

    const filtered = await app.gql({
      query: trackWorkActivityQuery,
      variables: { workspaceId: workspace.id, taskKey: readableKey },
    });
    t.deepEqual(
      filtered.trackWorkActivity.items.map(
        (item: { taskKey: string }) => item.taskKey
      ),
      [readableKey]
    );

    await app.login(owner);
    const ownerActivity = await app.gql({
      query: trackWorkActivityQuery,
      variables: { workspaceId: workspace.id },
    });
    t.is(ownerActivity.trackWorkActivity.items.length, 2);
  }
);
e2e(
  'activity pagination skips hidden rows without leaking or repeating',
  async t => {
    const owner = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });
    const member = await app.create(Mockers.User);
    await app.create(Mockers.WorkspaceUser, {
      userId: member.id,
      workspaceId: workspace.id,
      type: WorkspaceRole.Collaborator,
    });
    const db = app.get(PrismaClient);

    await db.workspaceDoc.create({
      data: {
        workspaceId: workspace.id,
        docId: 'restricted-doc-1',
        defaultRole: DocRole.None,
      },
    });
    await db.workspaceDoc.create({
      data: {
        workspaceId: workspace.id,
        docId: 'restricted-doc-2',
        defaultRole: DocRole.None,
      },
    });
    await db.workspaceDoc.create({
      data: {
        workspaceId: workspace.id,
        docId: 'readable-doc-1',
        defaultRole: DocRole.Manager,
      },
    });
    await db.trackWorkTask.createMany({
      data: [
        {
          id: `pt-${randomUUID()}`,
          workspaceId: workspace.id,
          docId: 'restricted-doc-1',
          taskKey: 'PR-1',
          number: 1,
          linksInitialized: true,
        },
        {
          id: `pt-${randomUUID()}`,
          workspaceId: workspace.id,
          docId: 'restricted-doc-2',
          taskKey: 'PR-2',
          number: 2,
          linksInitialized: true,
        },
        {
          id: `pt-${randomUUID()}`,
          workspaceId: workspace.id,
          docId: 'readable-doc-1',
          taskKey: 'PP-1',
          number: 3,
          linksInitialized: true,
        },
      ],
    });
    const conn = await db.developmentIntegrationConnection.create({
      data: {
        id: `pc-${randomUUID()}`,
        workspaceId: workspace.id,
        provider: 'gitlab',
        name: 'x',
        baseUrl: 'https://x',
        tokenCipher: 'cipher:x',
        enabled: true,
        createdById: owner.id,
      },
    });

    const rows: Array<{ taskKey: string; offsetMin: number }> = [
      { taskKey: 'PP-1', offsetMin: 6 },
      { taskKey: 'PR-2', offsetMin: 5 },
      { taskKey: 'PP-1', offsetMin: 4 },
      { taskKey: 'PR-1', offsetMin: 3 },
      { taskKey: 'PP-1', offsetMin: 2 },
      { taskKey: 'PR-2', offsetMin: 1 },
    ];
    await db.developmentActivity.createMany({
      data: rows.map((row, index) => ({
        id: `pa-${randomUUID()}`,
        workspaceId: workspace.id,
        connectionId: conn.id,
        taskKey: row.taskKey,
        eventType: 'commit.pushed',
        title: `activity ${index}`,
        url: `https://x/${index}`,
        authorName: 'a',
        repositoryName: 'r',
        metadata: {},
        createdAt: new Date(Date.now() + row.offsetMin * 60_000),
      })),
    });

    await app.login(member);
    const page1 = await app.gql({
      query: trackWorkActivityQuery,
      variables: { workspaceId: workspace.id, first: 2 },
    });
    t.deepEqual(
      page1.trackWorkActivity.items.map(
        (item: { taskKey: string }) => item.taskKey
      ),
      ['PP-1', 'PP-1']
    );
    t.is(page1.trackWorkActivity.hasNextPage, true);
    t.truthy(page1.trackWorkActivity.nextCursor);

    const page2 = await app.gql({
      query: trackWorkActivityQuery,
      variables: {
        workspaceId: workspace.id,
        first: 2,
        after: page1.trackWorkActivity.nextCursor,
      },
    });
    t.deepEqual(
      page2.trackWorkActivity.items.map(
        (item: { taskKey: string }) => item.taskKey
      ),
      ['PP-1']
    );
    t.is(page2.trackWorkActivity.hasNextPage, false);

    await app.login(owner);
    const ownerPage1 = await app.gql({
      query: trackWorkActivityQuery,
      variables: { workspaceId: workspace.id, first: 2 },
    });
    t.deepEqual(
      ownerPage1.trackWorkActivity.items.map(
        (item: { taskKey: string }) => item.taskKey
      ),
      ['PP-1', 'PR-2']
    );
  }
);

e2e(
  'readable activity rows are never skipped across page boundaries',
  async t => {
    const owner = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });
    const member = await app.create(Mockers.User);
    await app.create(Mockers.WorkspaceUser, {
      userId: member.id,
      workspaceId: workspace.id,
      type: WorkspaceRole.Collaborator,
    });
    const db = app.get(PrismaClient);

    await db.workspaceDoc.create({
      data: {
        workspaceId: workspace.id,
        docId: 'hidden-doc',
        defaultRole: DocRole.None,
      },
    });
    await db.workspaceDoc.create({
      data: {
        workspaceId: workspace.id,
        docId: 'visible-doc',
        defaultRole: DocRole.Manager,
      },
    });
    await db.trackWorkTask.createMany({
      data: [
        {
          id: `pt-${randomUUID()}`,
          workspaceId: workspace.id,
          docId: 'hidden-doc',
          taskKey: 'XH-1',
          number: 1,
          linksInitialized: true,
        },
        {
          id: `pt-${randomUUID()}`,
          workspaceId: workspace.id,
          docId: 'visible-doc',
          taskKey: 'XV-1',
          number: 2,
          linksInitialized: true,
        },
      ],
    });
    const conn = await db.developmentIntegrationConnection.create({
      data: {
        id: `pc-${randomUUID()}`,
        workspaceId: workspace.id,
        provider: 'gitlab',
        name: 'x',
        baseUrl: 'https://x',
        tokenCipher: 'cipher:x',
        enabled: true,
        createdById: owner.id,
      },
    });

    const rawOrder: Array<{ taskKey: string; offsetMin: number }> = [
      { taskKey: 'XH-1', offsetMin: 6 },
      { taskKey: 'XV-1', offsetMin: 5 },
      { taskKey: 'XV-1', offsetMin: 4 },
      { taskKey: 'XV-1', offsetMin: 3 },
      { taskKey: 'XH-1', offsetMin: 2 },
      { taskKey: 'XV-1', offsetMin: 1 },
    ];
    await db.developmentActivity.createMany({
      data: rawOrder.map((row, index) => ({
        id: `pa-${randomUUID()}`,
        workspaceId: workspace.id,
        connectionId: conn.id,
        taskKey: row.taskKey,
        eventType: 'commit.pushed',
        title: `activity ${index}`,
        url: `https://x/${index}`,
        authorName: 'a',
        repositoryName: 'r',
        metadata: {},
        createdAt: new Date(Date.now() + row.offsetMin * 60_000),
      })),
    });

    await app.login(member);

    const all: string[] = [];
    const allIds: string[] = [];
    let after: string | null | undefined;
    let guard = 0;
    let hasNextPage = true;
    while (hasNextPage && guard < 10) {
      const page = await app.gql({
        query: trackWorkActivityQuery,
        variables: {
          workspaceId: workspace.id,
          first: 2,
          after: after ?? null,
        },
      });
      all.push(
        ...page.trackWorkActivity.items.map(
          (item: { taskKey: string }) => item.taskKey
        )
      );
      allIds.push(
        ...page.trackWorkActivity.items.map((item: { id: string }) => item.id)
      );
      after = page.trackWorkActivity.nextCursor;
      hasNextPage = page.trackWorkActivity.hasNextPage;
      guard += 1;
    }

    t.deepEqual(all, ['XV-1', 'XV-1', 'XV-1', 'XV-1']);
    t.is(allIds.length, 4);
    t.is(new Set(allIds).size, allIds.length);

    await app.login(owner);
    const ownerPage = await app.gql({
      query: trackWorkActivityQuery,
      variables: { workspaceId: workspace.id, first: 2 },
    });
    t.deepEqual(
      ownerPage.trackWorkActivity.items.map(
        (item: { taskKey: string }) => item.taskKey
      ),
      ['XH-1', 'XV-1']
    );
  }
);

e2e('activity with only hidden rows terminates without leaking', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  const member = await app.create(Mockers.User);
  await app.create(Mockers.WorkspaceUser, {
    userId: member.id,
    workspaceId: workspace.id,
    type: WorkspaceRole.Collaborator,
  });
  const db = app.get(PrismaClient);

  await db.workspaceDoc.create({
    data: {
      workspaceId: workspace.id,
      docId: 'hidden-only-doc',
      defaultRole: DocRole.None,
    },
  });
  await db.trackWorkTask.createMany({
    data: [
      {
        id: `pt-${randomUUID()}`,
        workspaceId: workspace.id,
        docId: 'hidden-only-doc',
        taskKey: 'XZ-1',
        number: 1,
        linksInitialized: true,
      },
    ],
  });
  const conn = await db.developmentIntegrationConnection.create({
    data: {
      id: `pc-${randomUUID()}`,
      workspaceId: workspace.id,
      provider: 'gitlab',
      name: 'x',
      baseUrl: 'https://x',
      tokenCipher: 'cipher:x',
      enabled: true,
      createdById: owner.id,
    },
  });
  await db.developmentActivity.createMany({
    data: [
      {
        id: `pa-${randomUUID()}`,
        workspaceId: workspace.id,
        connectionId: conn.id,
        taskKey: 'XZ-1',
        eventType: 'commit.pushed',
        title: 'hidden one',
        url: 'u',
        authorName: 'a',
        repositoryName: 'r',
        metadata: {},
        createdAt: new Date(Date.now() + 60_000),
      },
      {
        id: `pa-${randomUUID()}`,
        workspaceId: workspace.id,
        connectionId: conn.id,
        taskKey: 'XZ-1',
        eventType: 'commit.pushed',
        title: 'hidden two',
        url: 'u',
        authorName: 'a',
        repositoryName: 'r',
        metadata: {},
        createdAt: new Date(Date.now() + 120_000),
      },
    ],
  });

  await app.login(member);
  const page = await app.gql({
    query: trackWorkActivityQuery,
    variables: { workspaceId: workspace.id, first: 2 },
  });
  t.deepEqual(page.trackWorkActivity.items, []);
  t.is(page.trackWorkActivity.hasNextPage, false);
});
