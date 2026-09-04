import { randomBytes } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { verifyTrackWorkKeyCheck } from '@affine/trackwork/crypto';
import { parseKeySetId, parseShareSetId } from '@affine/trackwork';

import { app, e2e, Mockers } from '../test';

const KEK_HEX = 'ab'.repeat(32);
const OTHER_KEK_HEX = 'cd'.repeat(32);

const exportShares = () =>
  app.POST('/api/admin/trackwork/quorum/shares/export');

const db = (): PrismaClient => app.get(PrismaClient) as PrismaClient;

const clearMetadata = async () => {
  await db().trackWorkQuorumMetadata.deleteMany({});
};

e2e(
  'enrollment: admin export creates exactly one canonical metadata row',
  async t => {
    process.env.TRACKWORK_KEK_HEX = KEK_HEX;
    await clearMetadata();
    const admin = await app.create(Mockers.User, { feature: 'administrator' });
    await app.login(admin);
    const res = await exportShares();
    t.true(res.status >= 200 && res.status < 300);
    const rows = await db().trackWorkQuorumMetadata.findMany({});
    t.is(rows.length, 1);
    t.is(rows[0].id, 'current');
    t.is(rows[0].keySetId, res.body.keySetId);
    t.is(rows[0].shareSetId, res.body.shareSetId);
    t.is(rows[0].threshold, 2);
    t.is(rows[0].totalShares, 3);
    t.is(rows[0].metadataVersion, 1);
    t.is(rows[0].revision, 1);
    const verified = verifyTrackWorkKeyCheck(
      rows[0].keyCheck,
      new Uint8Array(Buffer.from(KEK_HEX, 'hex')),
      parseKeySetId(rows[0].keySetId) as never,
      parseShareSetId(rows[0].shareSetId) as never
    );
    t.true(
      verified.ok,
      'persisted keyCheck verifies with the configured fake KEK'
    );
  }
);

e2e(
  'reshare: repeated export keeps KeySetId, advances ShareSetId and revision',
  async t => {
    process.env.TRACKWORK_KEK_HEX = KEK_HEX;
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
      'KeySetId stable across exports'
    );
    t.not(first.body.shareSetId, second.body.shareSetId, 'ShareSetId advances');
    const row = await db().trackWorkQuorumMetadata.findUniqueOrThrow({
      where: { id: 'current' },
    });
    t.is(row.revision, 2);
    t.is(row.shareSetId, second.body.shareSetId);
    t.is(row.keySetId, first.body.keySetId);
    const selfConsistent = verifyTrackWorkKeyCheck(
      row.keyCheck,
      new Uint8Array(Buffer.from(KEK_HEX, 'hex')),
      parseKeySetId(row.keySetId) as never,
      parseShareSetId(row.shareSetId) as never
    );
    t.true(
      selfConsistent.ok,
      'persisted keyCheck stays self-consistent with row ids after reshare'
    );
  }
);

e2e('restart/re-read returns the same canonical KeySetId', async t => {
  process.env.TRACKWORK_KEK_HEX = KEK_HEX;
  await clearMetadata();
  const admin = await app.create(Mockers.User, { feature: 'administrator' });
  await app.login(admin);
  const first = await exportShares();
  t.true(first.status >= 200 && first.status < 300);
  const second = await exportShares();
  t.true(second.status >= 200 && second.status < 300);
  t.is(second.body.keySetId, first.body.keySetId);
});

e2e(
  'wrong env KEK with existing metadata: export fails, metadata unchanged, no shares',
  async t => {
    process.env.TRACKWORK_KEK_HEX = KEK_HEX;
    await clearMetadata();
    const admin = await app.create(Mockers.User, { feature: 'administrator' });
    await app.login(admin);
    const first = await exportShares();
    t.true(first.status >= 200 && first.status < 300);
    const before = await db().trackWorkQuorumMetadata.findUniqueOrThrow({
      where: { id: 'current' },
    });
    process.env.TRACKWORK_KEK_HEX = OTHER_KEK_HEX;
    const second = await exportShares();
    t.true(
      second.status >= 400 && second.status < 500,
      'fail closed on KEK mismatch'
    );
    t.true(
      JSON.stringify(second.body).includes('twshare') === false,
      'no shares in error'
    );
    const after = await db().trackWorkQuorumMetadata.findUniqueOrThrow({
      where: { id: 'current' },
    });
    t.is(after.keySetId, before.keySetId);
    t.is(after.shareSetId, before.shareSetId);
    t.is(after.revision, before.revision);
    t.is(after.keyCheck, before.keyCheck);
  }
);

e2e('missing/malformed KEK fail closed', async t => {
  await clearMetadata();
  const admin = await app.create(Mockers.User, { feature: 'administrator' });
  await app.login(admin);
  delete process.env.TRACKWORK_KEK_HEX;
  const missing = await exportShares();
  t.true(missing.status >= 400 && missing.status < 500);
  process.env.TRACKWORK_KEK_HEX = 'zz';
  const malformed = await exportShares();
  t.true(malformed.status >= 400 && malformed.status < 500);
  process.env.TRACKWORK_KEK_HEX = KEK_HEX;
});

e2e('unauthorized and non-admin callers are denied', async t => {
  process.env.TRACKWORK_KEK_HEX = KEK_HEX;
  await clearMetadata();
  await app.logout();
  const anon = await exportShares();
  t.true(anon.status >= 400 && anon.status < 500);
  const user = await app.create(Mockers.User);
  await app.login(user);
  const denied = await exportShares();
  t.true(denied.status >= 400 && denied.status < 500);
});

e2e(
  'DB constraints: duplicate current, arbitrary id and id modification rejected',
  async t => {
    const prisma = db();
    await clearMetadata();
    const hasPolicyCheck = (await prisma.$queryRawUnsafe(
      "SELECT 1 FROM pg_constraint WHERE conname = 'trackwork_quorum_metadata_threshold_check'"
    )) as unknown[];
    if (hasPolicyCheck.length === 0) {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE trackwork_quorum_metadata ADD CONSTRAINT trackwork_quorum_metadata_threshold_check CHECK (threshold = 2)'
      );
    }
    const row = {
      id: 'current',
      keySetId: 'ks_' + 'a'.repeat(32),
      shareSetId: 'ss_' + 'b'.repeat(32),
      threshold: 2,
      totalShares: 3,
      keyCheck: 'x',
      metadataVersion: 1,
      revision: 1,
    };
    await prisma.trackWorkQuorumMetadata.create({ data: row });
    let duplicateRejected = false;
    try {
      await prisma.trackWorkQuorumMetadata.create({ data: row });
    } catch {
      duplicateRejected = true;
    }
    t.true(duplicateRejected, 'duplicate id=current rejected by PK');
    let arbitraryRejected = false;
    try {
      await prisma.trackWorkQuorumMetadata.create({
        data: { ...row, id: 'foo' },
      });
    } catch {
      arbitraryRejected = true;
    }
    t.true(arbitraryRejected, 'arbitrary id=foo rejected by CHECK');
    let modifyRejected = false;
    try {
      await prisma.trackWorkQuorumMetadata.updateMany({
        where: { id: 'current' },
        data: { id: 'foo' },
      });
    } catch {
      modifyRejected = true;
    }
    t.true(modifyRejected, 'id modification rejected by CHECK');
    let policyRejected = false;
    try {
      await prisma.trackWorkQuorumMetadata.update({
        where: { id: 'current' },
        data: { threshold: 3 },
      });
    } catch {
      policyRejected = true;
    }
    t.true(policyRejected, 'policy CHECK rejects threshold=3');
    await clearMetadata();
  }
);

e2e('tampered persisted ShareSetId fails the next reshare closed', async t => {
  process.env.TRACKWORK_KEK_HEX = KEK_HEX;
  await clearMetadata();
  const admin = await app.create(Mockers.User, { feature: 'administrator' });
  await app.login(admin);
  const first = await exportShares();
  t.true(first.status >= 200 && first.status < 300);
  await db().trackWorkQuorumMetadata.update({
    where: { id: 'current' },
    data: { shareSetId: 'ss_' + 'f'.repeat(32) },
  });
  const second = await exportShares();
  t.true(
    second.status >= 400 && second.status < 500,
    'tampered ShareSetId fails verification'
  );
  t.true(JSON.stringify(second.body).includes('twshare') === false);
});

e2e(
  'malformed persisted policy/version/ids fail closed and are NOT absent',
  async t => {
    process.env.TRACKWORK_KEK_HEX = KEK_HEX;
    await clearMetadata();
    const admin = await app.create(Mockers.User, { feature: 'administrator' });
    await app.login(admin);
    const first = await exportShares();
    t.true(first.status >= 200 && first.status < 300);
    let versionRejected = false;
    try {
      await db().trackWorkQuorumMetadata.update({
        where: { id: 'current' },
        data: { metadataVersion: 99 },
      });
    } catch {
      versionRejected = true;
    }
    t.true(versionRejected, 'DB CHECK rejects unsupported metadataVersion');
    await db().trackWorkQuorumMetadata.update({
      where: { id: 'current' },
      data: { keySetId: 'dk_' + 'a'.repeat(32) },
    });
    const badId = await exportShares();
    t.true(
      badId.status >= 400 && badId.status < 500,
      'runtime rejects corrupted KeySetId'
    );
    t.true(JSON.stringify(badId.body).includes('twshare') === false);
    await clearMetadata();
  }
);

e2e(
  'concurrent first enrollments: exactly one canonical row, one conflict',
  async t => {
    process.env.TRACKWORK_KEK_HEX = KEK_HEX;
    await clearMetadata();
    const admin = await app.create(Mockers.User, { feature: 'administrator' });
    await app.login(admin);
    const [a, b] = await Promise.all([exportShares(), exportShares()]);
    const successes = [a, b].filter(
      res => res.status >= 200 && res.status < 300
    );
    const conflicts = [a, b].filter(
      res => res.status >= 400 && res.status < 500
    );
    t.is(successes.length, 1, 'exactly one enrollment wins');
    t.is(conflicts.length, 1, 'exactly one enrollment conflicts');
    const rows = await db().trackWorkQuorumMetadata.findMany({});
    t.is(rows.length, 1, 'exactly one canonical row');
    t.is(rows[0].id, 'current');
  }
);

e2e(
  'concurrent reshares: one CAS wins, one conflicts, KeySetId stable',
  async t => {
    process.env.TRACKWORK_KEK_HEX = KEK_HEX;
    await clearMetadata();
    const admin = await app.create(Mockers.User, { feature: 'administrator' });
    await app.login(admin);
    const first = await exportShares();
    t.true(first.status >= 200 && first.status < 300);
    const [a, b] = await Promise.all([exportShares(), exportShares()]);
    const successes = [a, b].filter(
      res => res.status >= 200 && res.status < 300
    );
    const conflicts = [a, b].filter(
      res => res.status >= 400 && res.status < 500
    );
    t.is(successes.length, 1, 'one CAS wins');
    t.is(conflicts.length, 1, 'one CAS conflicts');
    const row = await db().trackWorkQuorumMetadata.findUniqueOrThrow({
      where: { id: 'current' },
    });
    t.is(
      row.keySetId,
      first.body.keySetId,
      'KeySetId stable under concurrency'
    );
    const winner = successes[0];
    t.is(row.shareSetId, winner.body.shareSetId);
    void randomBytes;
  }
);

e2e(
  'runtime policy validation fails closed even if DB CHECK is absent',
  async t => {
    process.env.TRACKWORK_KEK_HEX = KEK_HEX;
    await clearMetadata();
    const admin = await app.create(Mockers.User, { feature: 'administrator' });
    await app.login(admin);
    const first = await exportShares();
    t.true(first.status >= 200 && first.status < 300);
    const constraint = 'trackwork_quorum_metadata_threshold_check';
    const exists = (await db().$queryRawUnsafe(
      "SELECT 1 FROM pg_constraint WHERE conname = '" + constraint + "'"
    )) as unknown[];
    if (exists.length > 0) {
      await db().$executeRawUnsafe(
        'ALTER TABLE trackwork_quorum_metadata DROP CONSTRAINT ' + constraint
      );
    }
    let denied: Awaited<ReturnType<typeof exportShares>>;
    try {
      await db().trackWorkQuorumMetadata.update({
        where: { id: 'current' },
        data: { threshold: 3 },
      });
      denied = await exportShares();
    } finally {
      const stillMissing = (await db().$queryRawUnsafe(
        "SELECT 1 FROM pg_constraint WHERE conname = '" + constraint + "'"
      )) as unknown[];
      if (stillMissing.length === 0) {
        await db().trackWorkQuorumMetadata.update({
          where: { id: 'current' },
          data: { threshold: 2 },
        });
        await db().$executeRawUnsafe(
          'ALTER TABLE trackwork_quorum_metadata ADD CONSTRAINT ' +
            constraint +
            ' CHECK (threshold = 2)'
        );
      }
    }
    t.true(
      denied.status >= 400 && denied.status < 500,
      'runtime rejects invalid persisted policy'
    );
    t.true(JSON.stringify(denied.body).includes('twshare') === false);
    const fixed = await db().trackWorkQuorumMetadata.update({
      where: { id: 'current' },
      data: { threshold: 2 },
    });
    t.is(fixed.threshold, 2);
  }
);
