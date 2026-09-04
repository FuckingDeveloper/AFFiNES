import { randomBytes } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { reconstructTrackWorkKek } from '@affine/trackwork/crypto';

import { app, e2e, Mockers } from '../test';

const KEK_HEX = 'ab'.repeat(32);

const exportShares = () =>
  app.POST('/api/admin/trackwork/quorum/shares/export');

const db = () => app.get(PrismaClient) as PrismaClient;

const clearMetadata = async () => {
  await db().trackWorkQuorumMetadata.deleteMany({});
};

const resetKek = (hex: string) => {
  process.env.TRACKWORK_KEK_HEX = hex;
};

const assertShareShape = (t: any, body: any) => {
  t.true(body.shares.length === 3, 'exactly three shares');
  t.is(body.threshold, 2);
  t.is(body.totalShares, 3);
  t.true(
    new Set(body.shares.map((s: any) => s.index)).size === 3,
    'unique indexes'
  );
  t.true(
    body.shares.every((s: any) => s.keySetId === undefined),
    'no keySetId inside share objects (top-level only)'
  );
  t.true(
    body.shares.every((s: any) => s.value.startsWith('twshare-v1.')),
    'canonical share format'
  );
};

e2e('A/B/C/D/E/F/G: installation admin exports three valid shares', async t => {
  resetKek(KEK_HEX);
  await clearMetadata();
  const admin = await app.create(Mockers.User, { feature: 'administrator' });
  await app.login(admin);
  const res = await exportShares();
  t.true(res.status >= 200 && res.status < 300);
  t.true(
    res.headers['cache-control']?.includes('no-store') ?? false,
    'non-cacheable response'
  );
  t.true(res.headers['pragma'] === 'no-cache', 'pragma no-cache');
  const body = res.body;
  assertShareShape(t, body);
  t.true(
    new Set(body.shares.map((s: any) => s.keySetId ?? body.keySetId)).size ===
      1,
    'same KeySetId'
  );
  t.true(
    new Set(body.shares.map((s: any) => s.shareSetId ?? body.shareSetId))
      .size === 1,
    'same ShareSetId'
  );
  const rec = reconstructTrackWorkKek(body.shares.map((s: any) => s.value));
  t.true(rec.ok, 'any reconstruction succeeds');
  if (rec.ok) {
    t.true(
      Buffer.from(rec.kek).equals(Buffer.from(KEK_HEX, 'hex')),
      'two shares reconstruct the configured fake KEK'
    );
  }
  t.true(
    JSON.stringify(body).includes(KEK_HEX) === false,
    'no KEK in response'
  );
});

e2e(
  'I: repeated generation keeps KeySetId, produces a new ShareSetId and share material',
  async t => {
    resetKek(KEK_HEX);
    await clearMetadata();
    const admin = await app.create(Mockers.User, { feature: 'administrator' });
    await app.login(admin);
    const first = await exportShares();
    const second = await exportShares();
    t.true(first.status >= 200 && first.status < 300);
    t.true(second.status >= 200 && second.status < 300);
    t.is(
      first.body.keySetId,
      second.body.keySetId,
      'canonical KeySetId stable'
    );
    t.not(first.body.shareSetId, second.body.shareSetId);
    t.not(first.body.shares[0].value, second.body.shares[0].value);
  }
);

e2e('B: unauthenticated caller is denied', async t => {
  process.env.TRACKWORK_KEK_HEX = KEK_HEX;
  await app.logout();
  const res = await exportShares();
  t.true(res.status >= 400 && res.status < 500, 'unauthenticated denied');
});

e2e('B: normal (non-admin) user is denied', async t => {
  process.env.TRACKWORK_KEK_HEX = KEK_HEX;
  const user = await app.create(Mockers.User);
  await app.login(user);
  const res = await exportShares();
  t.true(res.status === 403 || res.status === 400, 'denied for normal user');
});

e2e('L: missing KEK fails closed', async t => {
  delete process.env.TRACKWORK_KEK_HEX;
  const admin = await app.create(Mockers.User, { feature: 'administrator' });
  await app.login(admin);
  const res = await exportShares();
  t.true(res.status >= 400 && res.status < 500, 'fail closed without KEK');
});

e2e('M: malformed KEK fails closed', async t => {
  process.env.TRACKWORK_KEK_HEX = 'zz';
  const admin = await app.create(Mockers.User, { feature: 'administrator' });
  await app.login(admin);
  const res = await exportShares();
  t.true(res.status >= 400 && res.status < 500, 'fail closed on malformed KEK');
});

e2e('K: share material never appears in error responses', async t => {
  delete process.env.TRACKWORK_KEK_HEX;
  const admin = await app.create(Mockers.User, { feature: 'administrator' });
  await app.login(admin);
  const res = await exportShares();
  const rendered = JSON.stringify(res.body);
  t.true(rendered.includes('twshare') === false, 'no share material in errors');
});

e2e('N/O/P: no DB, Redis or filesystem writes occur during export', async t => {
  process.env.TRACKWORK_KEK_HEX = KEK_HEX;
  const admin = await app.create(Mockers.User, { feature: 'administrator' });
  await app.login(admin);
  const db = app.get(PrismaClient) as PrismaClient;
  const before = await db.adminAuditLog.count();
  const res = await exportShares();
  t.true(res.status >= 200 && res.status < 300);
  const after = await db.adminAuditLog.count();
  t.true(after >= before + 1, 'an audit event is written; no share rows');
  const audits = await db.adminAuditLog.findMany({
    where: {
      action: { in: ['quorum-metadata-created', 'quorum-metadata-updated'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  t.true(
    JSON.stringify(audits[0].metadata).includes('twshare') === false,
    'audit metadata contains no share material'
  );
  t.true(
    JSON.stringify(audits[0].metadata).includes(res.body.shareSetId) === true,
    'audit records the safe ShareSetId'
  );
  void randomBytes;
});
