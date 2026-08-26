import { createHmac, randomUUID } from 'node:crypto';
import { IncomingMessage } from 'node:http';

import { HttpStatus } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';
import supertest from 'supertest';

import { CryptoHelper } from '../../base/helpers/crypto';
import { parseCookies as safeParseCookies } from '../../base/utils/request';
import { AuthService } from '../../core/auth/service';
import { Models } from '../../models';
import {
  createTestingApp,
  currentUser,
  parseCookies,
  TestingApp,
} from '../utils';

const test = ava as TestFn<{
  auth: AuthService;
  db: PrismaClient;
  crypto: CryptoHelper;
  models: Models;
  app: TestingApp;
}>;

function decodeBase32(input: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = input
    .replace(/=+$/g, '')
    .replace(/\s+/g, '')
    .toUpperCase();
  let value = 0;
  let bits = 0;
  const output: number[] = [];

  for (const char of normalized) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) {
      throw new Error('invalid base32');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

function generateTotpCode(secret: string) {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret))
    .update(counterBytes)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 1_000_000).toString().padStart(6, '0');
}

test.before(async t => {
  const app = await createTestingApp();

  t.context.auth = app.get(AuthService);
  t.context.db = app.get(PrismaClient);
  t.context.crypto = app.get(CryptoHelper);
  t.context.models = app.get(Models);
  t.context.app = app;
});

test.beforeEach(async t => {
  Sinon.reset();
  await t.context.app.initTestingDB();
});

test.after.always(async t => {
  await t.context.app.close();
});

test('should be able to sign in with credential', async t => {
  const { app } = t.context;

  const u1 = await app.createUser('u1@affine.pro');

  await app
    .POST('/api/auth/sign-in')
    .send({ email: u1.email, password: u1.password })
    .expect(200);

  const session = await currentUser(app);
  t.is(session?.id, u1.id);
});

test('should be able to sign in with username and password', async t => {
  const { app, models } = t.context;
  const created = await models.user.create({
    username: 'u1-login',
    email: 'u1-login@example.com',
    password: 'password',
    registered: true,
  });

  const response = await app
    .POST('/api/auth/sign-in')
    .send({ email: 'u1-login', password: 'password' })
    .expect(200);

  t.is(response.body.id, created.id);
  t.is(response.body.username, 'u1-login');
});

test('should require 2fa code when user has 2fa enabled', async t => {
  const { app, crypto, models } = t.context;
  const user = await app.createUser('u1-2fa-required@affine.pro');
  const secret = 'JBSWY3DPEHPK3PXP';
  await models.twoFactorAuth.upsert(user.id, crypto.encrypt(secret));

  const res = await app
    .POST('/api/auth/sign-in')
    .send({ email: user.email, password: user.password })
    .expect(400);

  t.is(res.body.name, 'BAD_REQUEST');
  t.is(res.body.message, 'TWO_FACTOR_REQUIRED');
});

test('should reject invalid 2fa code', async t => {
  const { app, crypto, models } = t.context;
  const user = await app.createUser('u1-2fa-invalid@affine.pro');
  const secret = 'JBSWY3DPEHPK3PXP';
  await models.twoFactorAuth.upsert(user.id, crypto.encrypt(secret));

  const res = await app
    .POST('/api/auth/sign-in')
    .send({
      email: user.email,
      password: user.password,
      twoFactorCode: '000000',
    })
    .expect(400);

  t.is(res.body.name, 'BAD_REQUEST');
  t.is(res.body.message, 'TWO_FACTOR_INVALID');
});

test('should sign in with valid 2fa code', async t => {
  const { app, crypto, models } = t.context;
  const user = await app.createUser('u1-2fa-valid@affine.pro');
  const secret = 'JBSWY3DPEHPK3PXP';
  await models.twoFactorAuth.upsert(user.id, crypto.encrypt(secret));

  await app
    .POST('/api/auth/sign-in')
    .send({
      email: user.email,
      password: user.password,
      twoFactorCode: generateTotpCode(secret),
    })
    .expect(200);

  t.pass();
});

test('should record sign in client version when header is provided', async t => {
  const { app, db } = t.context;

  const u1 = await app.createUser('u1@affine.pro');

  await app
    .POST('/api/auth/sign-in')
    .set('x-affine-version', '0.25.1')
    .send({ email: u1.email, password: u1.password })
    .expect(200);

  const userSession1 = await db.userSession.findFirst({
    where: { userId: u1.id },
  });
  t.is(userSession1?.signInClientVersion, '0.25.1');

  // should not overwrite existing value with null/undefined
  await app
    .POST('/api/auth/sign-in')
    .send({ email: u1.email, password: u1.password })
    .expect(200);

  const userSession2 = await db.userSession.findFirst({
    where: { userId: u1.id },
  });
  t.is(userSession2?.signInClientVersion, '0.25.1');
});

test('should require a password and never send a sign-in email', async t => {
  const { app } = t.context;

  const u1 = await app.createUser('u1@affine.pro');

  const res = await app
    .POST('/api/auth/sign-in')
    .send({ email: u1.email })
    .expect(HttpStatus.BAD_REQUEST);

  t.is(res.body.name, 'PASSWORD_REQUIRED');
  t.falsy(await currentUser(app));
});

test('should not be able to sign in if login is empty', async t => {
  const { app } = t.context;

  const res = await app
    .POST('/api/auth/sign-in')
    .send({ email: '' })
    .expect(400);

  t.is(res.body.message, 'INVALID_LOGIN');
});

test('should not be able to sign in if forbidden', async t => {
  const { app, auth } = t.context;

  const u1 = await app.createUser('u1@affine.pro');
  const canSignInStub = Sinon.stub(auth, 'canSignIn').resolves(false);

  await app
    .POST('/api/auth/sign-in')
    .send({ email: u1.email })
    .expect(HttpStatus.FORBIDDEN);

  canSignInStub.restore();
  t.pass();
});

test('should be able to sign out', async t => {
  const { app } = t.context;

  const u1 = await app.createUser('u1@affine.pro');

  await app
    .POST('/api/auth/sign-in')
    .send({ email: u1.email, password: u1.password })
    .expect(200);

  await app.POST('/api/auth/sign-out').expect(200);

  const session = await currentUser(app);

  t.falsy(session);
});

test('should be able to sign out when csrf header is missing (compat)', async t => {
  const { app } = t.context;

  const u1 = await app.createUser('u1@affine.pro');

  const signInRes = await supertest(app.getHttpServer())
    .post('/api/auth/sign-in')
    .send({ email: u1.email, password: u1.password })
    .expect(200);

  const cookies = parseCookies(signInRes);
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

  await supertest(app.getHttpServer())
    .post('/api/auth/sign-out')
    .set('Cookie', cookieHeader)
    .expect(200);

  const sessionRes = await supertest(app.getHttpServer())
    .get('/api/auth/session')
    .set('Cookie', cookieHeader)
    .expect(200);

  t.falsy(sessionRes.body.user);
});

test('should be able to sign out when duplicated csrf cookies exist', async t => {
  const { app } = t.context;

  const u1 = await app.createUser('u1@affine.pro');

  const signInRes = await supertest(app.getHttpServer())
    .post('/api/auth/sign-in')
    .send({ email: u1.email, password: u1.password })
    .expect(200);

  const cookies = parseCookies(signInRes);
  const csrf = cookies[AuthService.csrfCookieName];

  const cookieHeader = [
    `${AuthService.sessionCookieName}=${cookies[AuthService.sessionCookieName]}`,
    `${AuthService.userCookieName}=${cookies[AuthService.userCookieName]}`,
    `${AuthService.csrfCookieName}=${csrf}`,
    `${AuthService.csrfCookieName}=${randomUUID()}`,
  ].join('; ');

  await supertest(app.getHttpServer())
    .post('/api/auth/sign-out')
    .set('Cookie', cookieHeader)
    .set('x-affine-csrf-token', csrf)
    .expect(200);

  const sessionRes = await supertest(app.getHttpServer())
    .get('/api/auth/session')
    .set('Cookie', cookieHeader)
    .expect(200);

  t.falsy(sessionRes.body.user);
});

test('should be able to sign out via GET /api/auth/sign-out (deprecated)', async t => {
  const { app } = t.context;

  const u1 = await app.createUser('u1@affine.pro');

  await app
    .POST('/api/auth/sign-in')
    .send({ email: u1.email, password: u1.password })
    .expect(200);

  const res = await app.GET('/api/auth/sign-out').expect(200);
  t.is(res.headers.deprecation, 'true');

  const session = await currentUser(app);
  t.falsy(session);
});

test('should reject sign out when csrf token mismatched', async t => {
  const { app } = t.context;

  const u1 = await app.createUser('u1@affine.pro');

  await app
    .POST('/api/auth/sign-in')
    .send({ email: u1.email, password: u1.password })
    .expect(200);

  await app
    .POST('/api/auth/sign-out')
    .set('x-affine-csrf-token', 'invalid')
    .expect(HttpStatus.FORBIDDEN);

  const session = await currentUser(app);
  t.is(session?.id, u1.id);
});

test('should sign in desktop app via one-time open-app code', async t => {
  const { app } = t.context;

  const u1 = await app.createUser('u1@affine.pro');

  await app
    .POST('/api/auth/sign-in')
    .send({ email: u1.email, password: u1.password })
    .expect(200);

  const codeRes = await app.POST('/api/auth/open-app/sign-in-code').expect(201);

  const code = codeRes.body.code as string;
  t.truthy(code);

  const exchangeRes = await supertest(app.getHttpServer())
    .post('/api/auth/open-app/sign-in')
    .send({ code })
    .expect(201);

  const exchangedCookies = exchangeRes.get('Set-Cookie') ?? [];
  t.true(
    exchangedCookies.some(c =>
      c.startsWith(`${AuthService.sessionCookieName}=`)
    )
  );

  const cookieHeader = exchangedCookies.map(c => c.split(';')[0]).join('; ');
  const sessionRes = await supertest(app.getHttpServer())
    .get('/api/auth/session')
    .set('Cookie', cookieHeader)
    .expect(200);

  t.is(sessionRes.body.user?.id, u1.id);

  // one-time use
  await supertest(app.getHttpServer())
    .post('/api/auth/open-app/sign-in')
    .send({ code })
    .expect(400)
    .expect({
      status: 400,
      code: 'Bad Request',
      type: 'BAD_REQUEST',
      name: 'INVALID_AUTH_STATE',
      message:
        'Invalid auth state. You might start the auth progress from another device.',
    });
});

test('should be able to correct user id cookie', async t => {
  const { app } = t.context;

  const u1 = await app.signupV1('u1@affine.pro');

  const req = app.GET('/api/auth/session');
  let cookies = req.get('cookie') as unknown as string[];
  cookies = cookies.filter(c => !c.startsWith(AuthService.userCookieName));
  cookies.push(`${AuthService.userCookieName}=invalid_user_id`);
  const res = await req.set('Cookie', cookies).expect(200);
  const setCookies = parseCookies(res);
  const userIdCookie = setCookies[AuthService.userCookieName];

  t.is(userIdCookie, u1.id);
});

test('should not throw on parse of a bad cookie', async t => {
  const badCookieKey = 'auth_session';
  const badCookieVal = '^13l3PK9qJs*J%X$MOOOIguhkqWvVh7*';

  const req = {
    headers: { cookie: `${badCookieKey}=${badCookieVal}` },
  } as IncomingMessage & { cookies?: Record<string, string> };

  t.notThrows(() => safeParseCookies(req));

  t.is(req.cookies?.[badCookieKey], badCookieVal);
});

// multiple accounts session tests
test('should be able to sign in another account in one session', async t => {
  const { app } = t.context;

  const u1 = await app.createUser('u1@affine.pro');
  const u2 = await app.createUser('u2@affine.pro');

  // sign in u1
  const res = await app
    .POST('/api/auth/sign-in')
    .send({ email: u1.email, password: u1.password })
    .expect(200);

  const cookies = parseCookies(res);

  // sign in u2 in the same session
  await app
    .POST('/api/auth/sign-in')
    .send({ email: u2.email, password: u2.password })
    .expect(200);

  // list [u1, u2]
  const sessions = await app.GET('/api/auth/sessions').expect(200);

  t.is(sessions.body.users.length, 2);
  t.like(
    sessions.body.users.map((u: any) => u.id),
    [u1.id, u2.id]
  );

  // default to latest signed in user: u2
  let session = await app.GET('/api/auth/session').expect(200);

  t.is(session.body.user.id, u2.id);

  // switch to u1
  session = await app
    .GET('/api/auth/session')
    .set(
      'Cookie',
      Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ')
    )
    .expect(200);

  t.is(session.body.user.id, u1.id);
});

test('should be able to sign out multiple accounts in one session', async t => {
  const { app } = t.context;

  const u1 = await app.signupV1('u1@affine.pro');
  const u2 = await app.signupV1('u2@affine.pro');

  // sign out u2
  await app.POST(`/api/auth/sign-out?user_id=${u2.id}`).expect(200);

  // list [u1]
  let session = await app.GET('/api/auth/session').expect(200);
  t.is(session.body.user.id, u1.id);

  // sign in u2 in the same session
  await app
    .POST('/api/auth/sign-in')
    .send({ email: u2.email, password: u2.password })
    .expect(200);

  // sign out all account in session
  await app.POST('/api/auth/sign-out').expect(200);

  session = await app.GET('/api/auth/session').expect(200);
  t.falsy(session.body.user);
});

test('should reject the disabled magic-link endpoint', async t => {
  const { app } = t.context;

  const res = await app
    .POST('/api/auth/magic-link')
    .send({ email: 'u1@affine.pro', token: 'invalid' })
    .expect(HttpStatus.FORBIDDEN);

  t.is(res.body.message, 'Email sign-in is disabled');
});
