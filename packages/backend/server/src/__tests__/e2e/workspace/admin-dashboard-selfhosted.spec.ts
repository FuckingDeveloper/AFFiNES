import { PrismaClient } from '@prisma/client';

import {
  createApp,
  e2e,
  MockedUser,
  Mockers,
  refreshEnv,
  type TestingApp,
} from '../test';

async function gql(query: string, variables?: Record<string, unknown>) {
  const res = await app.POST('/graphql').send({ query, variables }).expect(200);
  return res.body as {
    data?: Record<string, any>;
    errors?: Array<{ message: string; extensions: Record<string, any> }>;
  };
}

async function ensureAnalyticsTables(db: PrismaClient) {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS workspace_admin_stats (
      workspace_id VARCHAR NOT NULL PRIMARY KEY,
      snapshot_count BIGINT NOT NULL DEFAULT 0,
      snapshot_size BIGINT NOT NULL DEFAULT 0,
      blob_count BIGINT NOT NULL DEFAULT 0,
      blob_size BIGINT NOT NULL DEFAULT 0,
      member_count BIGINT NOT NULL DEFAULT 0,
      public_page_count BIGINT NOT NULL DEFAULT 0,
      features TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
      updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
    );
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS workspace_admin_stats_daily (
      workspace_id VARCHAR NOT NULL,
      date DATE NOT NULL,
      snapshot_size BIGINT NOT NULL DEFAULT 0,
      blob_size BIGINT NOT NULL DEFAULT 0,
      member_count BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
      PRIMARY KEY (workspace_id, date)
    );
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS sync_active_users_minutely (
      minute_ts TIMESTAMPTZ(3) NOT NULL PRIMARY KEY,
      active_users INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
    );
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS workspace_doc_view_daily (
      workspace_id VARCHAR NOT NULL,
      doc_id VARCHAR NOT NULL,
      date DATE NOT NULL,
      total_views BIGINT NOT NULL DEFAULT 0,
      unique_views BIGINT NOT NULL DEFAULT 0,
      guest_views BIGINT NOT NULL DEFAULT 0,
      last_accessed_at TIMESTAMPTZ(3),
      updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
      PRIMARY KEY (workspace_id, doc_id, date)
    );
  `);
}

const DASHBOARD_QUERY = `
  query AdminDashboard($input: AdminDashboardInput) {
    adminDashboard(input: $input) {
      syncActiveUsers
      syncActiveUsersTimeline {
        minute
        activeUsers
      }
      syncWindow {
        from
        to
        timezone
        bucket
        requestedSize
        effectiveSize
      }
      copilotConversations
      workspaceStorageBytes
      blobStorageBytes
      workspaceStorageHistory {
        date
        value
      }
      blobStorageHistory {
        date
        value
      }
      storageWindow {
        from
        to
        timezone
        bucket
        requestedSize
        effectiveSize
      }
      topSharedLinks {
        workspaceId
        docId
        views
        uniqueViews
        guestViews
      }
      topSharedLinksWindow {
        from
        to
        timezone
        bucket
        requestedSize
        effectiveSize
      }
      generatedAt
    }
  }
`;

let app: TestingApp;
let admin: MockedUser;

e2e.before(async () => {
  process.env.DEPLOYMENT_TYPE = 'selfhosted';
  refreshEnv();

  app = await createApp();
  await app.get(PrismaClient).$executeRawUnsafe(`
    TRUNCATE TABLE
      sync_active_users_minutely,
      workspace_admin_stats,
      workspace_admin_stats_daily,
      workspace_doc_view_daily
  `);
  admin = await app.create(Mockers.User, {
    feature: 'administrator',
  });
});

e2e.beforeEach(async () => {
  await app.login(admin);
});

e2e.after.always(async () => {
  await app.close();
});

e2e(
  'adminDashboard should return a valid dashboard in self-hosted without analytics data',
  async t => {
    const db = app.get(PrismaClient);
    await ensureAnalyticsTables(db);

    const result = await gql(DASHBOARD_QUERY, {
      input: {
        timezone: 'UTC',
        storageHistoryDays: 7,
        syncHistoryHours: 6,
        sharedLinkWindowDays: 7,
      },
    });

    t.falsy(result.errors, JSON.stringify(result.errors));
    const dashboard = result.data!.adminDashboard;
    t.true(typeof dashboard.syncActiveUsers === 'number');
    t.true(typeof dashboard.copilotConversations === 'number');
    t.true(typeof dashboard.workspaceStorageBytes === 'number');
    t.true(typeof dashboard.blobStorageBytes === 'number');
    t.true(Array.isArray(dashboard.topSharedLinks));
    t.true(Array.isArray(dashboard.syncActiveUsersTimeline));
    t.true(Array.isArray(dashboard.workspaceStorageHistory));
    t.true(Array.isArray(dashboard.blobStorageHistory));
    t.is(dashboard.syncWindow.bucket, 'Minute');
    t.is(dashboard.storageWindow.bucket, 'Day');
    t.truthy(dashboard.generatedAt);
  }
);

e2e('adminDashboard should reflect analytics data in self-hosted', async t => {
  const db = app.get(PrismaClient);
  await ensureAnalyticsTables(db);

  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  const minute = new Date(Date.now() - 60_000);
  minute.setSeconds(0, 0);

  await db.$executeRaw`
    INSERT INTO sync_active_users_minutely (minute_ts, active_users, updated_at)
    VALUES (${minute}, 7, NOW())
    ON CONFLICT (minute_ts)
    DO UPDATE SET active_users = EXCLUDED.active_users, updated_at = EXCLUDED.updated_at
  `;

  await db.$executeRaw`
    INSERT INTO workspace_admin_stats (
      workspace_id, snapshot_count, snapshot_size, blob_count, blob_size, member_count, public_page_count, features, updated_at
    )
    VALUES (${workspace.id}, 1, 100, 1, 50, 1, 1, ARRAY[]::text[], NOW())
    ON CONFLICT (workspace_id)
    DO UPDATE SET
      snapshot_count = EXCLUDED.snapshot_count,
      snapshot_size = EXCLUDED.snapshot_size,
      blob_count = EXCLUDED.blob_count,
      blob_size = EXCLUDED.blob_size,
      member_count = EXCLUDED.member_count,
      public_page_count = EXCLUDED.public_page_count,
      features = EXCLUDED.features,
      updated_at = EXCLUDED.updated_at
  `;

  const result = await gql(DASHBOARD_QUERY, {
    input: {
      timezone: 'UTC',
      storageHistoryDays: 7,
      syncHistoryHours: 6,
      sharedLinkWindowDays: 7,
    },
  });

  t.falsy(result.errors, JSON.stringify(result.errors));
  const dashboard = result.data!.adminDashboard;
  t.true(dashboard.workspaceStorageBytes >= 100);
  t.true(dashboard.blobStorageBytes >= 50);
  t.true(typeof dashboard.copilotConversations === 'number');
  t.true(
    (await db.syncActiveUsersMinutely.count({
      where: { activeUsers: 7 },
    })) >= 1
  );
});
