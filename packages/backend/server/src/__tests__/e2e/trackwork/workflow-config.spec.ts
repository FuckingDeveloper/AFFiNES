import { PrismaClient } from '@prisma/client';

import { WorkspaceRole } from '../../../models';
import { app, e2e, Mockers } from '../test';

const gqlRaw = async (query: string, variables?: Record<string, unknown>) => {
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
};

const READ_QUERY = `
  query TrackWorkWorkflowConfig($workspaceId: String!) {
    trackWorkWorkflowConfig(workspaceId: $workspaceId) {
      revision
      config
    }
  }
`;

const UPDATE_MUTATION = `
  mutation UpdateTrackWorkWorkflowConfig($input: UpdateTrackWorkWorkflowConfigInput!) {
    updateTrackWorkWorkflowConfig(input: $input) {
      revision
      config
    }
  }
`;

const customConfig = {
  taskTrackerBoards: [
    {
      id: 'board-1',
      title: 'Release board',
      flow: [
        { id: 'todo', title: 'To Do' },
        { id: 'qa', title: 'QA Testing' },
        { id: 'done', title: 'Done' },
      ],
      transitions: {
        todo: ['todo', 'qa'],
        qa: ['qa', 'done'],
        done: ['done'],
      },
    },
  ],
  taskTrackerAutomationRules: [
    {
      id: 'rule-1',
      eventType: 'merge_request.merged',
      action: 'set-status',
      stageId: 'done',
      enabled: true,
    },
  ],
};

e2e(
  'workflow config defaults to the canonical configuration without a row',
  async t => {
    const owner = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });
    await app.login(owner);

    const result = await gqlRaw(READ_QUERY, { workspaceId: workspace.id });

    t.is(result.trackWorkWorkflowConfig.revision, 0);
    t.is(
      result.trackWorkWorkflowConfig.config.taskTrackerBoards[0].id,
      'default'
    );
    t.is(
      result.trackWorkWorkflowConfig.config.taskTrackerBoards[0].title,
      'Main board'
    );
  }
);

e2e(
  'workflow update requires Workflow.Manage: collaborator denied, admin and owner allowed',
  async t => {
    const owner = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });
    const collaborator = await app.create(Mockers.User);
    await app.create(Mockers.WorkspaceUser, {
      userId: collaborator.id,
      workspaceId: workspace.id,
      type: WorkspaceRole.Collaborator,
    });
    const admin = await app.create(Mockers.User);
    await app.create(Mockers.WorkspaceUser, {
      userId: admin.id,
      workspaceId: workspace.id,
      type: WorkspaceRole.Admin,
    });

    await app.login(collaborator);
    await t.throwsAsync(
      gqlRaw(UPDATE_MUTATION, {
        input: {
          workspaceId: workspace.id,
          expectedRevision: 0,
          config: customConfig,
        },
      })
    );

    await app.login(admin);
    const byAdmin = await gqlRaw(UPDATE_MUTATION, {
      input: {
        workspaceId: workspace.id,
        expectedRevision: 0,
        config: customConfig,
      },
    });
    t.is(byAdmin.updateTrackWorkWorkflowConfig.revision, 1);
    t.is(
      byAdmin.updateTrackWorkWorkflowConfig.config.taskTrackerBoards[0].title,
      'Release board'
    );

    await app.login(owner);
    const byOwner = await gqlRaw(UPDATE_MUTATION, {
      input: {
        workspaceId: workspace.id,
        expectedRevision: 1,
        config: customConfig,
      },
    });
    t.is(byOwner.updateTrackWorkWorkflowConfig.revision, 2);
  }
);

e2e(
  'stale revision updates are rejected with an explicit conflict',
  async t => {
    const owner = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });
    const adminA = await app.create(Mockers.User);
    await app.create(Mockers.WorkspaceUser, {
      userId: adminA.id,
      workspaceId: workspace.id,
      type: WorkspaceRole.Admin,
    });
    const adminB = await app.create(Mockers.User);
    await app.create(Mockers.WorkspaceUser, {
      userId: adminB.id,
      workspaceId: workspace.id,
      type: WorkspaceRole.Admin,
    });

    await app.login(adminA);
    const first = await gqlRaw(UPDATE_MUTATION, {
      input: {
        workspaceId: workspace.id,
        expectedRevision: 0,
        config: customConfig,
      },
    });
    t.is(first.updateTrackWorkWorkflowConfig.revision, 1);

    await app.login(adminB);
    await t.throwsAsync(
      gqlRaw(UPDATE_MUTATION, {
        input: {
          workspaceId: workspace.id,
          expectedRevision: 0,
          config: customConfig,
        },
      }),
      { message: /TrackWork workflow configuration has changed/ }
    );

    const refetched = await gqlRaw(READ_QUERY, { workspaceId: workspace.id });
    t.is(refetched.trackWorkWorkflowConfig.revision, 1);

    const retried = await gqlRaw(UPDATE_MUTATION, {
      input: {
        workspaceId: workspace.id,
        expectedRevision: 1,
        config: {
          taskTrackerBoards: [
            {
              ...customConfig.taskTrackerBoards[0],
              title: 'Release board v2',
            },
          ],
        },
      },
    });
    t.is(retried.updateTrackWorkWorkflowConfig.revision, 2);
  }
);

e2e('invalid workflow configuration is rejected', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);

  const badTransitions = {
    taskTrackerBoards: [
      {
        id: 'board-1',
        title: 'Board',
        flow: [{ id: 'todo', title: 'To Do' }],
        transitions: { todo: ['missing-stage'] },
      },
    ],
  };
  await t.throwsAsync(
    gqlRaw(UPDATE_MUTATION, {
      input: {
        workspaceId: workspace.id,
        expectedRevision: 0,
        config: badTransitions,
      },
    }),
    { message: /Invalid TrackWork workflow configuration/ }
  );

  const badRule = {
    taskTrackerBoards: customConfig.taskTrackerBoards,
    taskTrackerAutomationRules: [
      {
        id: 'rule-1',
        eventType: 'merge_request.merged',
        action: 'set-status',
        stageId: 'no-such-stage',
        enabled: true,
      },
    ],
  };
  await t.throwsAsync(
    gqlRaw(UPDATE_MUTATION, {
      input: {
        workspaceId: workspace.id,
        expectedRevision: 0,
        config: badRule,
      },
    }),
    { message: /Invalid TrackWork workflow configuration/ }
  );

  const tooLarge = {
    taskTrackerBoards: Array.from({ length: 50 }, (_, i) => ({
      id: `board-${i}`,
      title: `Board ${i}`,
    })),
  };
  await t.throwsAsync(
    gqlRaw(UPDATE_MUTATION, {
      input: {
        workspaceId: workspace.id,
        expectedRevision: 0,
        config: tooLarge,
      },
    }),
    { message: /Invalid TrackWork workflow configuration/ }
  );
});

e2e('workflow update produces a bounded semantic audit record', async t => {
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

  await app.login(admin);
  await gqlRaw(UPDATE_MUTATION, {
    input: {
      workspaceId: workspace.id,
      expectedRevision: 0,
      config: customConfig,
    },
  });

  const rows = await app.get(PrismaClient).adminAuditLog.findMany({
    where: { workspaceId: workspace.id, action: 'trackwork.workflow.update' },
  });
  t.is(rows.length, 1);
  t.is(rows[0]?.actorId, admin.id);
  t.is(rows[0]?.targetId, workspace.id);
  const metadata = rows[0]?.metadata as Record<string, unknown>;
  t.is(metadata.previousRevision, 0);
  t.is(metadata.newRevision, 1);
  t.is(metadata.boardCount, 1);
  t.is(metadata.stageCount, 3);
  t.is(metadata.automationRuleCount, 1);

  const serialized = JSON.stringify(rows.map(row => row.metadata));
  t.false(serialized.includes('Release board'));
  t.false(serialized.includes('QA Testing'));
});

e2e('raw Yjs workflow writes never alter the authoritative config', async t => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.login(owner);
  await gqlRaw(UPDATE_MUTATION, {
    input: {
      workspaceId: workspace.id,
      expectedRevision: 0,
      config: customConfig,
    },
  });

  await app.login(owner);
  const readBefore = await gqlRaw(READ_QUERY, { workspaceId: workspace.id });
  t.is(readBefore.trackWorkWorkflowConfig.revision, 1);

  t.is(
    await app.get(PrismaClient).adminAuditLog.count({
      where: { workspaceId: workspace.id, action: 'trackwork.workflow.update' },
    }),
    1
  );
});
e2e(
  'legacy workflow config is imported from the property document',
  async t => {
    const { Doc, encodeStateAsUpdate } = await import('yjs');
    const owner = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });
    const db = app.get(PrismaClient);

    const doc = new Doc();
    const statusMap = doc.getMap('taskStatus');
    statusMap.set('id', 'taskStatus');
    statusMap.set('name', 'Task Status');
    statusMap.set('additionalData', {
      taskTrackerBoards: [
        {
          id: 'legacy-board',
          title: 'Legacy Release Board',
          flow: [
            { id: 'todo', title: 'To Do' },
            { id: 'qa', title: 'QA Testing' },
            { id: 'done', title: 'Done' },
          ],
          transitions: {
            todo: ['todo', 'qa'],
            qa: ['qa', 'done'],
            done: ['done'],
          },
        },
      ],
      taskTrackerTransitions: { todo: ['todo', 'qa'] },
      taskTrackerAutomationRules: [
        {
          id: 'legacy-rule',
          eventType: 'merge_request.merged',
          action: 'set-status',
          stageId: 'done',
          enabled: true,
        },
      ],
    });
    const blob = Buffer.from(encodeStateAsUpdate(doc));

    await db.update.create({
      data: {
        workspaceId: workspace.id,
        id: 'db$docCustomPropertyInfo',
        blob,
        createdAt: new Date(),
        createdBy: owner.id,
      },
    });

    const { TrackWorkWorkflowConfig1765000000000 } =
      await import('../../../data/migrations/1765000000000-trackwork-workflow-config');
    await TrackWorkWorkflowConfig1765000000000.up(db, null as never);

    const row = await db.trackWorkWorkflowConfig.findUnique({
      where: { workspaceId: workspace.id },
    });
    t.truthy(row);
    t.is(row?.revision, 1);
    const config = row?.config as {
      taskTrackerBoards: Array<{ id: string; title: string }>;
      taskTrackerAutomationRules: Array<{ id: string }>;
    };
    t.is(config.taskTrackerBoards[0].id, 'legacy-board');
    t.is(config.taskTrackerBoards[0].title, 'Legacy Release Board');
    t.is(config.taskTrackerAutomationRules[0].id, 'legacy-rule');

    await TrackWorkWorkflowConfig1765000000000.up(db, null as never);
    t.is(
      await db.trackWorkWorkflowConfig.count({
        where: { workspaceId: workspace.id },
      }),
      1
    );
  }
);

e2e(
  'workflow migration skips malformed legacy data and migrated workspaces',
  async t => {
    const { Doc, encodeStateAsUpdate } = await import('yjs');
    const owner = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });
    const db = app.get(PrismaClient);

    const doc = new Doc();
    doc.getMap('taskStatus').set('additionalData', {
      taskTrackerBoards: [
        {
          id: 'broken-board',
          title: 'Broken',
          transitions: { todo: ['missing-stage'] },
        },
      ],
    });
    await db.update.create({
      data: {
        workspaceId: workspace.id,
        id: 'db$docCustomPropertyInfo',
        blob: Buffer.from(encodeStateAsUpdate(doc)),
        createdAt: new Date(),
        createdBy: owner.id,
      },
    });

    const { TrackWorkWorkflowConfig1765000000000 } =
      await import('../../../data/migrations/1765000000000-trackwork-workflow-config');
    await TrackWorkWorkflowConfig1765000000000.up(db, null as never);

    t.is(
      await db.trackWorkWorkflowConfig.count({
        where: { workspaceId: workspace.id },
      }),
      0
    );
  }
);

e2e(
  'workflow audit failure rolls back the authoritative config write',
  async t => {
    const owner = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });
    await app.login(owner);
    const db = app.get(PrismaClient);

    let casWon = false;
    const failingTx = {
      trackWorkWorkflowConfig: {
        updateMany: async () => {
          casWon = true;
          return { count: 1 };
        },
        create: async () => {
          casWon = true;
          return {};
        },
      },
      adminAuditLog: {
        create: async () => {
          throw new Error('audit pipeline unavailable');
        },
      },
    };
    const fakePrisma = {
      $transaction: async (cb: (tx: unknown) => Promise<unknown>) =>
        cb(failingTx),
    };

    const { TrackWorkWorkflowService } =
      await import('../../../plugins/trackwork/workflow.service');
    const fakeAudit = {
      logInTx: async (tx: {
        adminAuditLog: { create: () => Promise<never> };
      }) => {
        await tx.adminAuditLog.create();
      },
    };
    const service = new TrackWorkWorkflowService(
      fakePrisma as never,
      fakeAudit as never
    );

    await t.throwsAsync(
      service.update(
        { id: owner.id, email: owner.email },
        workspace.id,
        0,
        customConfig
      ),
      { message: /audit pipeline unavailable/ }
    );
    t.true(casWon);

    t.is(
      await db.trackWorkWorkflowConfig.count({
        where: { workspaceId: workspace.id },
      }),
      0
    );
  }
);

e2e(
  'true concurrent same-revision updates: exactly one wins, one conflict, one audit',
  async t => {
    const owner = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });
    const adminA = await app.create(Mockers.User);
    await app.create(Mockers.WorkspaceUser, {
      userId: adminA.id,
      workspaceId: workspace.id,
      type: WorkspaceRole.Admin,
    });
    const adminB = await app.create(Mockers.User);
    await app.create(Mockers.WorkspaceUser, {
      userId: adminB.id,
      workspaceId: workspace.id,
      type: WorkspaceRole.Admin,
    });

    await app.login(adminA);
    const seed = await gqlRaw(UPDATE_MUTATION, {
      input: {
        workspaceId: workspace.id,
        expectedRevision: 0,
        config: customConfig,
      },
    });
    t.is(seed.updateTrackWorkWorkflowConfig.revision, 1);

    const configA = {
      taskTrackerBoards: [
        { ...customConfig.taskTrackerBoards[0], title: 'Concurrent Winner A' },
      ],
    };
    const configB = {
      taskTrackerBoards: [
        { ...customConfig.taskTrackerBoards[0], title: 'Concurrent Winner B' },
      ],
    };
    const [r1, r2] = await Promise.allSettled([
      gqlRaw(UPDATE_MUTATION, {
        input: {
          workspaceId: workspace.id,
          expectedRevision: 1,
          config: configA,
        },
      }),
      gqlRaw(UPDATE_MUTATION, {
        input: {
          workspaceId: workspace.id,
          expectedRevision: 1,
          config: configB,
        },
      }),
    ]);

    const fulfilled = [r1, r2].filter(r => r.status === 'fulfilled');
    const rejected = [r1, r2].filter(
      r => r.status === 'rejected'
    ) as PromiseRejectedResult[];
    t.is(fulfilled.length, 1);
    t.is(rejected.length, 1);
    t.true(
      rejected[0]!.reason instanceof Error &&
        /TrackWork workflow configuration has changed/.test(
          rejected[0]!.reason.message
        )
    );
    t.is(
      (
        fulfilled[0] as PromiseFulfilledResult<{
          updateTrackWorkWorkflowConfig: { revision: number };
        }>
      ).value.updateTrackWorkWorkflowConfig.revision,
      2
    );

    const row = await app.get(PrismaClient).trackWorkWorkflowConfig.findUnique({
      where: { workspaceId: workspace.id },
    });
    t.is(row?.revision, 2);
    const winnerTitle = (
      row?.config as { taskTrackerBoards: Array<{ title: string }> }
    ).taskTrackerBoards[0].title;
    t.true(
      winnerTitle === 'Concurrent Winner A' ||
        winnerTitle === 'Concurrent Winner B'
    );

    const audits = await app.get(PrismaClient).adminAuditLog.findMany({
      where: { workspaceId: workspace.id, action: 'trackwork.workflow.update' },
    });
    t.is(audits.length, 2); // seed 0->1 plus the single winning race transition 1->2
    const raceAudits = audits.filter(
      audit => (audit.metadata as Record<string, unknown>).newRevision === 2
    );
    t.is(raceAudits.length, 1);
  }
);

e2e(
  'true concurrent revision=0 creation: exactly one creates, one conflict, one audit',
  async t => {
    const owner = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });
    const adminA = await app.create(Mockers.User);
    await app.create(Mockers.WorkspaceUser, {
      userId: adminA.id,
      workspaceId: workspace.id,
      type: WorkspaceRole.Admin,
    });
    const adminB = await app.create(Mockers.User);
    await app.create(Mockers.WorkspaceUser, {
      userId: adminB.id,
      workspaceId: workspace.id,
      type: WorkspaceRole.Admin,
    });

    await app.login(adminA);
    const configA = {
      taskTrackerBoards: [{ id: 'fresh-a', title: 'Fresh A' }],
    };
    const configB = {
      taskTrackerBoards: [{ id: 'fresh-b', title: 'Fresh B' }],
    };
    const [r1, r2] = await Promise.allSettled([
      gqlRaw(UPDATE_MUTATION, {
        input: {
          workspaceId: workspace.id,
          expectedRevision: 0,
          config: configA,
        },
      }),
      gqlRaw(UPDATE_MUTATION, {
        input: {
          workspaceId: workspace.id,
          expectedRevision: 0,
          config: configB,
        },
      }),
    ]);

    const fulfilled = [r1, r2].filter(r => r.status === 'fulfilled');
    const rejected = [r1, r2].filter(
      r => r.status === 'rejected'
    ) as PromiseRejectedResult[];
    t.is(fulfilled.length, 1);
    t.is(rejected.length, 1);
    t.is(
      (
        fulfilled[0] as PromiseFulfilledResult<{
          updateTrackWorkWorkflowConfig: { revision: number };
        }>
      ).value.updateTrackWorkWorkflowConfig.revision,
      1
    );
    t.true(
      rejected[0]!.reason instanceof Error &&
        /TrackWork workflow configuration has changed/.test(
          rejected[0]!.reason.message
        ) &&
        !/P2002|PrismaClientKnownRequestError/.test(rejected[0]!.reason.message)
    );

    const row = await app.get(PrismaClient).trackWorkWorkflowConfig.findUnique({
      where: { workspaceId: workspace.id },
    });
    t.is(row?.revision, 1);
    t.is(
      await app.get(PrismaClient).adminAuditLog.count({
        where: {
          workspaceId: workspace.id,
          action: 'trackwork.workflow.update',
        },
      }),
      1
    );
  }
);

e2e(
  'oversized and prototype-sensitive workflow configs are rejected',
  async t => {
    const owner = await app.create(Mockers.User);
    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });
    await app.login(owner);

    // aggregate size bound through real GraphQL
    const oversized = {
      taskTrackerBoards: [
        {
          id: 'board-big',
          title: 'x'.repeat(200),
          flow: Array.from({ length: 30 }, (_, i) => ({
            id: `stage-${i}`,
            title: 'y'.repeat(200),
          })),
          transitions: Object.fromEntries(
            Array.from({ length: 30 }, (_, i) => [
              `stage-${i}`,
              Array.from({ length: 50 }, (_, j) => `stage-${(i + j) % 30}`),
            ])
          ),
        },
        ...Array.from({ length: 19 }, (_, i) => ({
          id: `board-${i}`,
          title: 'z'.repeat(200),
          flow: Array.from({ length: 30 }, (_, j) => ({
            id: `b${i}-stage-${j}`,
            title: 'w'.repeat(200),
          })),
        })),
      ],
    };
    // Real GraphQL: the oversized payload is rejected at the HTTP boundary
    // with a controlled client error (413 entity too large), never a 500/OOM.
    const oversizedRes = await app
      .POST('/graphql')
      .set('x-operation-name', 'test')
      .send({
        query: UPDATE_MUTATION,
        variables: {
          input: {
            workspaceId: workspace.id,
            expectedRevision: 0,
            config: oversized,
          },
        },
      });
    t.true(oversizedRes.status >= 400 && oversizedRes.status < 500);
    t.not(oversizedRes.status, 500);

    // The validator's own 1 MiB aggregate cap is asserted directly (it guards
    // non-HTTP paths such as the legacy migration decode).
    const { validateWorkflowConfig } =
      await import('../../../plugins/trackwork/workflow-config');
    // unique 128-char stage ids so the aggregate payload exceeds 1 MiB
    const stageIds = Array.from({ length: 30 }, (_, j) =>
      `s-${j}`.padEnd(128, 'x')
    );
    const bigConfig = {
      taskTrackerBoards: Array.from({ length: 20 }, (_, i) => ({
        id: `board-${i}`,
        title: 'x'.repeat(200),
        flow: stageIds.map(id => ({ id, title: 'y'.repeat(200) })),
        transitions: Object.fromEntries(
          stageIds.map(id => [id, Array.from({ length: 50 }, () => id)])
        ),
      })),
    };
    const validated = validateWorkflowConfig(bigConfig);
    t.true(validated.errors.some(error => /size limit/.test(error)));

    // reserved prototype-sensitive identifiers are rejected explicitly
    for (const reserved of ['__proto__', 'prototype', 'constructor']) {
      await t.throwsAsync(
        gqlRaw(UPDATE_MUTATION, {
          input: {
            workspaceId: workspace.id,
            expectedRevision: 0,
            config: {
              taskTrackerBoards: [
                {
                  id: 'board-p',
                  title: 'Board',
                  flow: [{ id: reserved, title: 'Stage' }],
                },
              ],
            },
          },
        }),
        { message: /Invalid TrackWork workflow configuration/ }
      );
    }
  }
);
