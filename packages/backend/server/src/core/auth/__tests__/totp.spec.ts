import test from 'ava';

import { verifyTotp } from '../totp';

const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('verifyTotp rejects codes with the wrong length', t => {
  t.false(verifyTotp(SECRET, '12345'));
  t.false(verifyTotp(SECRET, '1234567'));
  t.false(verifyTotp(SECRET, ''));
});

test('verifyTotp rejects non-digit codes', t => {
  t.false(verifyTotp(SECRET, 'abcdef'));
  t.false(verifyTotp(SECRET, '12345a'));
  t.false(verifyTotp(SECRET, '12345.'));
});

test('verifyTotp rejects malicious digits values without throwing', t => {
  // @ts-expect-error deliberate misuse
  t.false(verifyTotp(SECRET, '123456', { digits: '6' }));
  // @ts-expect-error deliberate misuse
  t.false(verifyTotp(SECRET, '123456', { digits: '6{2,}' }));
  // @ts-expect-error deliberate misuse
  t.false(verifyTotp(SECRET, '123456', { digits: NaN }));
  t.false(verifyTotp(SECRET, '123456', { digits: 0 }));
  t.false(verifyTotp(SECRET, '123456', { digits: -6 }));
  t.false(verifyTotp(SECRET, '123456', { digits: 2.5 }));
});

test('verifyTotp rejects codes when the format check fails', t => {
  t.false(verifyTotp('ZZZZZZZZZZZZZZZZZZZZ', '000000'));
});
