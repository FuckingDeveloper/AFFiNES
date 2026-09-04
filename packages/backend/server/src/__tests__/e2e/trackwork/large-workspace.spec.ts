import { PrismaClient } from '@prisma/client';

import { DocRole, WorkspaceRole } from '../../../models';
import { app, e2e, Mockers } from '../test';

const SYNC_MUTATION = `
  mutation SyncTrackWorkTasks($input: SyncTrackWorkTasksInput!) {
    syncTrackWorkTasks(input: $input) {
      taskKey
      docId
      number
    }
  }
`;

const TASK_QUERY = `
  query TrackWorkTask($workspaceId: String!, $taskKey: String!) {
    trackWorkTask(workspaceId: $workspaceId, taskKey: $taskKey) {
      taskKey
      docId
      number
    }
  }
`;

const BACKLINKS_QUERY = `
  query TrackWorkDocumentBacklinks($workspaceId: String!, $documentId: String!) {
    trackWorkDocumentBacklinks(workspaceId: $workspaceId, documentId: $documentId) {
      taskKey
      number
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
      items { id taskKey eventType }
      nextCursor
      hasNextPage
    }
  }
`;

const WORKFLOW_QUERY = `
  query TrackWorkWorkflowConfig($workspaceId: String!) {
    trackWorkWorkflowConfig(workspaceId: $workspaceId) {
      revision
      config
    }
  }
`;

const WORKFLOW_MUTATION = `
  mutation UpdateTrackWorkWorkflowConfig($input: UpdateTrackWorkWorkflowConfigInput!) {
    updateTrackWorkWorkflowConfig(input: $input) {
      revision
      config
    }
  }
`;

const STAGE_IDS = ['backlog', 'ready', 'dev', 'qa', 'review', 'done'];
const STAGE_TITLES: Record<string, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  dev: 'In Development',
  qa: 'QA',
  review: 'In Review',
  done: 'Done',
};

const workflowConfig = {
  taskTrackerBoards: [
    {
      id: 'board-main',
      title: 'Main delivery board',
      flow: STAGE_IDS.map(id => ({ id, title: STAGE_TITLES[id] })),
      transitions: {
        backlog: ['backlog', 'ready'],
        ready: ['ready', 'dev'],
        dev: ['dev', 'qa'],
        qa: ['qa', 'review', 'dev'],
        review: ['review', 'done', 'qa'],
        done: ['done'],
      },
      typeTransitions: {
        bug: { qa: ['qa', 'dev'], review: ['review', 'qa'] },
      },
    },
  ],
  taskTrackerAutomationRules: [
    {
      id: 'rule-ship',
      eventType: 'merge_request.merged',
      action: 'set-status',
      stageId: 'done',
      enabled: true,
    },
    {
      id: 'rule-warn-fail',
      eventType: 'pipeline.failed',
      action: 'warning',
      enabled: true,
    },
    {
      id: 'rule-qa',
      eventType: 'merge_request.opened',
      action: 'set-status',
      stageId: 'qa',
      enabled: false,
    },
  ],
};

const TASK_COUNT = 500;

const buildSyncInput = (start: number, count: number) => ({
  workspaceId: '',
  prefix: 'TASK',
  tasks: Array.from({ length: count }, (_, i) => {
    const n = start + i;
    const docId = `large-task-doc-${String(n).padStart(4, '0')}`;
    return {
      docId,
      taskKey: `TASK-${n}`,
      relatedDocumentIds:
        n % 10 === 0 ? [`doc-rel-${n}`, `doc-rel-${n + 1}`] : [],
    };
  }),
});

e2e(
  'large workspace fixture: 500 tasks across registry, workflow, pagination',
  async t => {
    const owner = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });
    await app.login(owner);
    const db = app.get(PrismaClient);
    const wsId = workspace.id;

    const wfStart = Date.now();
    const wfSeed = await gqlRaw(WORKFLOW_MUTATION, {
      input: { workspaceId: wsId, expectedRevision: 0, config: workflowConfig },
    });
    t.is(wfSeed.updateTrackWorkWorkflowConfig.revision, 1);
    const wfMs = Date.now() - wfStart;

    const connection = await db.developmentIntegrationConnection.create({
      data: {
        workspaceId: wsId,
        provider: 'gitlab',
        name: 'fixture',
        baseUrl: 'https://gitlab.example.test',
        tokenCipher: 'fixture-placeholder-cipher-no-secrets',
        createdById: owner.id,
      },
    });

    const syncInput = buildSyncInput(1, TASK_COUNT);
    syncInput.workspaceId = wsId;
    const syncStart = Date.now();
    const synced = await gqlRaw(SYNC_MUTATION, { input: syncInput });
    const syncMs = Date.now() - syncStart;
    t.is(synced.syncTrackWorkTasks.length, TASK_COUNT);
    t.is(synced.syncTrackWorkTasks[0].taskKey, 'TASK-1');
    t.is(
      synced.syncTrackWorkTasks[TASK_COUNT - 1].taskKey,
      `TASK-${TASK_COUNT}`
    );

    const rows = await db.trackWorkTask.findMany({
      where: { workspaceId: wsId },
      select: { number: true, taskKey: true, docId: true },
      orderBy: { number: 'asc' },
    });
    t.is(rows.length, TASK_COUNT);
    t.deepEqual(
      rows.map(r => r.number),
      Array.from({ length: TASK_COUNT }, (_, i) => i + 1)
    );
    t.is(new Set(rows.map(r => r.taskKey)).size, TASK_COUNT);
    t.is(new Set(rows.map(r => r.docId)).size, TASK_COUNT);

    for (const key of ['TASK-1', 'TASK-250', 'TASK-500']) {
      const found = await gqlRaw(TASK_QUERY, {
        workspaceId: wsId,
        taskKey: key,
      });
      t.is(found.trackWorkTask.taskKey, key);
      t.is(
        found.trackWorkTask.docId,
        `large-task-doc-${String(Number(key.split('-')[1])).padStart(4, '0')}`
      );
    }

    const withLinks = rows.filter(r => r.number % 10 === 0);
    t.is(withLinks.length, 50);
    const backlinks = await gqlRaw(BACKLINKS_QUERY, {
      workspaceId: wsId,
      documentId: 'doc-rel-10',
    });
    t.true(
      (backlinks.trackWorkDocumentBacklinks as Array<{ taskKey: string }>).some(
        b => b.taskKey === 'TASK-10'
      )
    );

    const resyncStart = Date.now();
    await gqlRaw(SYNC_MUTATION, { input: syncInput });
    const resyncMs = Date.now() - resyncStart;
    t.is(
      await db.trackWorkTask.count({ where: { workspaceId: wsId } }),
      TASK_COUNT
    );
    const next = buildSyncInput(TASK_COUNT + 1, 1);
    next.workspaceId = wsId;
    const appended = await gqlRaw(SYNC_MUTATION, { input: next });
    t.is(appended.syncTrackWorkTasks[0].taskKey, 'TASK-501');
    t.is(
      await db.trackWorkTask.count({ where: { workspaceId: wsId } }),
      TASK_COUNT + 1
    );

    const wfRead = await gqlRaw(WORKFLOW_QUERY, { workspaceId: wsId });
    t.is(wfRead.trackWorkWorkflowConfig.revision, 1);
    const board = wfRead.trackWorkWorkflowConfig.config.taskTrackerBoards[0];
    t.is(board.flow.length, 6);
    t.is(board.id, 'board-main');
    t.is(board.transitions.qa.join(','), 'qa,review,dev');
    t.is(board.typeTransitions.bug.review.join(','), 'review,qa');
    t.is(
      wfRead.trackWorkWorkflowConfig.config.taskTrackerAutomationRules.length,
      3
    );

    t.is(
      await db.adminAuditLog.count({
        where: { workspaceId: wsId, action: 'trackwork.workflow.update' },
      }),
      1
    );

    const activityTaskKeys = rows.slice(0, 12).map(r => r.taskKey);
    await db.developmentActivity.createMany({
      data: Array.from({ length: 120 }, (_, i) => ({
        workspaceId: wsId,
        connectionId: connection.id,
        taskKey: activityTaskKeys[i % activityTaskKeys.length],
        eventType: 'pipeline.success',
        title: `fixture activity ${i}`,
        url: `https://gitlab.example.test/-/pipelines/${i}`,
        authorName: 'fixture-bot',
        metadata: { kind: 'fixture' },
      })),
    });

    const activityStart = Date.now();
    const collected: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await gqlRaw(ACTIVITY_QUERY, {
        workspaceId: wsId,
        first: 50,
        after: cursor ?? undefined,
      });
      const data = page.trackWorkActivity;
      collected.push(...data.items.map((item: { id: string }) => item.id));
      cursor = data.nextCursor;
      pages += 1;
      t.is(data.items.length > 0, true);
      t.is(data.hasNextPage, cursor !== null);
    } while (cursor);
    const activityMs = Date.now() - activityStart;
    t.is(pages, 3);
    t.is(collected.length, 120);
    t.is(
      new Set(collected).size,
      120,
      'no duplicate activity rows across pages'
    );

    const restrictedDocIds = rows.slice(12, 22).map(r => r.docId);
    for (const docId of restrictedDocIds) {
      await db.workspaceDoc.create({
        data: { workspaceId: wsId, docId, defaultRole: DocRole.None },
      });
    }
    const member = await app.create(Mockers.User);
    await app.create(Mockers.WorkspaceUser, {
      userId: member.id,
      workspaceId: wsId,
      type: WorkspaceRole.Collaborator,
    });
    await app.login(member);
    const memberCollected: string[] = [];
    let memberCursor: string | null = null;
    do {
      const page = await gqlRaw(ACTIVITY_QUERY, {
        workspaceId: wsId,
        first: 50,
        after: memberCursor ?? undefined,
      });
      const data = page.trackWorkActivity;
      memberCollected.push(
        ...data.items.map((item: { id: string }) => item.id)
      );
      memberCursor = data.nextCursor;
    } while (memberCursor);
    const restrictedKeys = new Set(rows.slice(12, 22).map(r => r.taskKey));
    t.true(
      memberCollected.every(
        (id: string) =>
          !restrictedKeys.has(id) &&
          restrictedDocIds.every(docId => !id.includes(docId))
      )
    );

    await app.login(owner);
    const foreignOwner = await app.create(Mockers.User);
    const foreignWs = await app.create(Mockers.Workspace, {
      owner: { id: foreignOwner.id },
    });
    await t.throwsAsync(
      gqlRaw(TASK_QUERY, {
        workspaceId: foreignWs.id,
        taskKey: 'TASK-250',
      }),
      { message: /do not have permission/ }
    );

    t.log(
      `timings: workflowSeed=${wfMs}ms sync500=${syncMs}ms resync500=${resyncMs}ms activity120(3 pages)=${activityMs}ms`
    );
  }
);

async function gqlRaw(query: string, variables?: Record<string, unknown>) {
  const res = await app
    .POST('/graphql')
    .set('x-operation-name', 'test')
    .send({ query, variables });
  if (res.body.errors) {
    const error = new Error(res.body.errors[0].message);
    (error as Error & { extensions?: unknown }).extensions =
      res.body.errors[0].extensions;
    throw error;
  }
  return res.body.data;
}
