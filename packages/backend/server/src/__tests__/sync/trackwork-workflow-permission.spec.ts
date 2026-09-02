import { PrismaClient } from '@prisma/client';
import test, { type ExecutionContext } from 'ava';
import { io, type Socket as SocketIOClient } from 'socket.io-client';
import { Doc, encodeStateAsUpdate } from 'yjs';

import { Models, WorkspaceMemberStatus, WorkspaceRole } from '../../models';
import { createTestingApp, TestingApp } from '../utils';

// OpenSpec 1.4 reproduction: the workspace-db document
// `db$docCustomPropertyInfo` carries the TrackWork workflow configuration
// (taskTrackerBoards/flow/transitions/automation rules in additionalData).
// Does the server's collaborative sync path reject a non-admin member
// pushing updates to that document?

const WS_TIMEOUT_MS = 5_000;
const apps: TestingApp[] = [];

test.after.always(async () => {
  await Promise.all(apps.map(app => app.close()));
});

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

test('collaborator can push workflow configuration updates to the properties doc', async t => {
  const app = await createTestingApp();
  apps.push(app);
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
    // RESULT B: the server accepts the collaborator's push. The sync push
    // path enforces only workspace membership (Workspace.Sync) and the
    // blocked-doc flag; the per-document Doc.Update assertion in
    // core/sync/gateway.ts is commented out.
    const data = unwrapResponse(t, push);
    t.true(data.accepted);

    const persisted = await db.update.findFirst({
      where: {
        workspaceId: workspace.id,
        id: 'db$docCustomPropertyInfo',
        createdBy: collaborator.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    t.truthy(persisted);
  } finally {
    socket.disconnect();
  }
});

test('owner push to the workflow properties doc also succeeds', async t => {
  const app = await createTestingApp();
  apps.push(app);
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
