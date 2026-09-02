import { PrismaClient } from '@prisma/client';
import test, { type ExecutionContext } from 'ava';
import { io, type Socket as SocketIOClient } from 'socket.io-client';
import { Doc, encodeStateAsUpdate } from 'yjs';

import { Models, WorkspaceMemberStatus, WorkspaceRole } from '../../models';
import { createTestingApp, TestingApp } from '../utils';

// OpenSpec 1.4 reproduction: the workspace-db document
// `db$docCustomPropertyInfo` carries the workspace custom-property schema,
// including TrackWork workflow configuration (taskTrackerBoards/flow/
// transitions/automation rules in additionalData). The server's sync push
// path must require Workspace.Properties.Update for this document.

const WS_TIMEOUT_MS = 5_000;

type WebsocketResponse<T> =
  | { error: { name: string; message: string } }
  | { data: T };

function unwrapResponse<T>(t: ExecutionContext, res: WebsocketResponse<T>): T {
  if ('data' in res) {
    return res.data;
  }
  t.log(res);
  throw new Error(`Websocket error: ${res.error.name}: ${res.error.message}`);
}

function withTimeout<T>(promise: Promise<T>, label: string) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout: ${label}`)), WS_TIMEOUT_MS);
    }),
  ]);
}

function createClient(url: string, cookie: string): SocketIOClient {
  return io(url, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    extraHeaders: { cookie },
  });
}

function waitForConnect(socket: SocketIOClient) {
  if (socket.connected) {
    return Promise.resolve();
  }
  return withTimeout(
    new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    }),
    'connect'
  );
}

function emitWithAck<T>(socket: SocketIOClient, event: string, data: unknown) {
  return withTimeout(
    new Promise<WebsocketResponse<T>>(resolve => {
      socket.emit(event, data, (res: WebsocketResponse<T>) => resolve(res));
    }),
    `ack ${event}`
  );
}

async function login(
  app: TestingApp,
  user?: Awaited<ReturnType<TestingApp['createUser']>>
) {
  const sessionUser = user ?? (await app.createUser());
  const res = await app
    .POST('/api/auth/sign-in')
    .send({ email: sessionUser.email, password: sessionUser.password })
    .expect(200);
  const cookies = res.get('Set-Cookie') ?? [];
  const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
  return { user: sessionUser, cookieHeader };
}

function workflowConfigUpdateBase64() {
  const doc = new Doc();
  doc.getMap('docCustomPropertyInfo').set('status', {
    additionalData: {
      taskTrackerBoards: [
        {
          id: 'board-1',
          title: 'Release board',
          transitions: { todo: ['todo', 'done'] },
        },
      ],
      taskTrackerTransitions: { todo: ['todo', 'done'] },
      taskTrackerAutomationRules: [],
    },
  });
  return Buffer.from(encodeStateAsUpdate(doc)).toString('base64');
}

function genericPropertySchemaUpdateBase64() {
  const doc = new Doc();
  doc.getMap('docCustomPropertyInfo').set('favoriteColor', {
    name: 'Favorite Color',
    type: 'text',
  });
  return Buffer.from(encodeStateAsUpdate(doc)).toString('base64');
}

test('collaborator cannot push updates to the workspace-property schema doc', async t => {
  const app = await createTestingApp();
  t.teardown(() => app.close());
  const db = app.get(PrismaClient);

  const models = app.get(Models);
  const owner = await app.createUser();
  const workspace = await models.workspace.create(owner.id);
  await models.workspaceUser.setStatus(
    workspace.id,
    owner.id,
    WorkspaceMemberStatus.Accepted
  );
  const collaborator = await app.createUser();
  await models.workspaceUser.set(
    workspace.id,
    collaborator.id,
    WorkspaceRole.Collaborator,
    { status: WorkspaceMemberStatus.Accepted }
  );

  const collaboratorSession = await login(app, collaborator);
  const url = app.url();

  const socket = createClient(url, collaboratorSession.cookieHeader);
  try {
    await waitForConnect(socket);

    const join = unwrapResponse(
      t,
      await emitWithAck<{ clientId: string; success: boolean }>(
        socket,
        'space:join',
        {
          spaceType: 'workspace',
          spaceId: workspace.id,
          clientVersion: '0.26.0',
        }
      )
    );
    t.true(join.success);

    const push = await emitWithAck<{ accepted: true; timestamp?: number }>(
      socket,
      'space:push-doc-update',
      {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId: 'db$docCustomPropertyInfo',
        update: workflowConfigUpdateBase64(),
      }
    );
    // Fixed behavior: the server rejects the collaborator's push with the
    // standard SpaceAccessDenied error and persists nothing.
    if ('data' in push) {
      t.log(push);
      t.fail('expected the push to be rejected');
    } else {
      t.is(push.error.name, 'SPACE_ACCESS_DENIED');
    }

    t.is(
      await db.update.count({
        where: {
          workspaceId: workspace.id,
          id: 'db$docCustomPropertyInfo',
          createdBy: collaborator.id,
        },
      }),
      0
    );
  } finally {
    socket.disconnect();
  }
});

test('collaborator cannot push generic custom-property schema updates either', async t => {
  const app = await createTestingApp();
  t.teardown(() => app.close());
  const models = app.get(Models);
  const owner = await app.createUser();
  const workspace = await models.workspace.create(owner.id);
  await models.workspaceUser.setStatus(
    workspace.id,
    owner.id,
    WorkspaceMemberStatus.Accepted
  );
  const collaborator = await app.createUser();
  await models.workspaceUser.set(
    workspace.id,
    collaborator.id,
    WorkspaceRole.Collaborator,
    { status: WorkspaceMemberStatus.Accepted }
  );
  const collaboratorSession = await login(app, collaborator);
  const url = app.url();

  const socket = createClient(url, collaboratorSession.cookieHeader);
  try {
    await waitForConnect(socket);
    unwrapResponse(
      t,
      await emitWithAck<{ clientId: string; success: boolean }>(
        socket,
        'space:join',
        {
          spaceType: 'workspace',
          spaceId: workspace.id,
          clientVersion: '0.26.0',
        }
      )
    );

    const push = await emitWithAck<{ accepted: true; timestamp?: number }>(
      socket,
      'space:push-doc-update',
      {
        spaceType: 'workspace',
        spaceId: workspace.id,
        docId: 'db$docCustomPropertyInfo',
        update: genericPropertySchemaUpdateBase64(),
      }
    );
    if ('data' in push) {
      t.log(push);
      t.fail('expected a generic property schema push to be rejected');
    } else {
      t.is(push.error.name, 'SPACE_ACCESS_DENIED');
    }
  } finally {
    socket.disconnect();
  }
});

test('collaborator can still push normal task document updates', async t => {
  const app = await createTestingApp();
  t.teardown(() => app.close());
  const models = app.get(Models);
  const owner = await app.createUser();
  const workspace = await models.workspace.create(owner.id);
  await models.workspaceUser.setStatus(
    workspace.id,
    owner.id,
    WorkspaceMemberStatus.Accepted
  );
  const collaborator = await app.createUser();
  await models.workspaceUser.set(
    workspace.id,
    collaborator.id,
    WorkspaceRole.Collaborator,
    { status: WorkspaceMemberStatus.Accepted }
  );
  const collaboratorSession = await login(app, collaborator);
  const url = app.url();

  const socket = createClient(url, collaboratorSession.cookieHeader);
  try {
    await waitForConnect(socket);
    unwrapResponse(
      t,
      await emitWithAck<{ clientId: string; success: boolean }>(
        socket,
        'space:join',
        {
          spaceType: 'workspace',
          spaceId: workspace.id,
          clientVersion: '0.26.0',
        }
      )
    );

    const doc = new Doc();
    doc.getMap('task').set('status', 'in-progress');
    const update = Buffer.from(encodeStateAsUpdate(doc)).toString('base64');

    const push = unwrapResponse(
      t,
      await emitWithAck<{ accepted: true; timestamp?: number }>(
        socket,
        'space:push-doc-update',
        {
          spaceType: 'workspace',
          spaceId: workspace.id,
          docId: 'task-doc-1',
          update,
        }
      )
    );
    t.true(push.accepted);
  } finally {
    socket.disconnect();
  }
});

test('workspace admin can push updates to the properties doc', async t => {
  const app = await createTestingApp();
  t.teardown(() => app.close());
  const db = app.get(PrismaClient);
  const models = app.get(Models);
  const owner = await app.createUser();
  const workspace = await models.workspace.create(owner.id);
  await models.workspaceUser.setStatus(
    workspace.id,
    owner.id,
    WorkspaceMemberStatus.Accepted
  );
  const admin = await app.createUser();
  await models.workspaceUser.set(workspace.id, admin.id, WorkspaceRole.Admin, {
    status: WorkspaceMemberStatus.Accepted,
  });
  const adminSession = await login(app, admin);
  const url = app.url();

  const socket = createClient(url, adminSession.cookieHeader);
  try {
    await waitForConnect(socket);
    unwrapResponse(
      t,
      await emitWithAck<{ clientId: string; success: boolean }>(
        socket,
        'space:join',
        {
          spaceType: 'workspace',
          spaceId: workspace.id,
          clientVersion: '0.26.0',
        }
      )
    );

    const push = unwrapResponse(
      t,
      await emitWithAck<{ accepted: true; timestamp?: number }>(
        socket,
        'space:push-doc-update',
        {
          spaceType: 'workspace',
          spaceId: workspace.id,
          docId: 'db$docCustomPropertyInfo',
          update: workflowConfigUpdateBase64(),
        }
      )
    );
    t.true(push.accepted);

    t.is(
      await db.update.count({
        where: {
          workspaceId: workspace.id,
          id: 'db$docCustomPropertyInfo',
          createdBy: admin.id,
        },
      }),
      1
    );
  } finally {
    socket.disconnect();
  }
});

test('owner push to the workflow properties doc also succeeds', async t => {
  const app = await createTestingApp();
  t.teardown(() => app.close());
  const ownerSession = await login(app);
  const models = app.get(Models);
  const workspace = await models.workspace.create(ownerSession.user.id);
  await models.workspaceUser.setStatus(
    workspace.id,
    ownerSession.user.id,
    WorkspaceMemberStatus.Accepted
  );
  const url = app.url();

  const socket = createClient(url, ownerSession.cookieHeader);
  try {
    await waitForConnect(socket);
    const join = unwrapResponse(
      t,
      await emitWithAck<{ clientId: string; success: boolean }>(
        socket,
        'space:join',
        {
          spaceType: 'workspace',
          spaceId: workspace.id,
          clientVersion: '0.26.0',
        }
      )
    );
    t.true(join.success);
    const push = unwrapResponse(
      t,
      await emitWithAck<{ accepted: true; timestamp?: number }>(
        socket,
        'space:push-doc-update',
        {
          spaceType: 'workspace',
          spaceId: workspace.id,
          docId: 'db$docCustomPropertyInfo',
          update: workflowConfigUpdateBase64(),
        }
      )
    );
    t.true(push.accepted);
  } finally {
    socket.disconnect();
  }
});
