import test from 'ava';

import { isSensitiveKey, REDACTED, redactString, redactValue } from '../redact';

test('recognizes sensitive keys case-insensitively', t => {
  t.true(isSensitiveKey('token'));
  t.true(isSensitiveKey('accessToken'));
  t.true(isSensitiveKey('refresh_token'));
  t.true(isSensitiveKey('password'));
  t.true(isSensitiveKey('webhookSecret'));
  t.true(isSensitiveKey('webhook_secret'));
  t.true(isSensitiveKey('clientSecret'));
  t.true(isSensitiveKey('apiKey'));
  t.true(isSensitiveKey('privateKey'));
  t.true(isSensitiveKey('keyShare'));
  t.true(isSensitiveKey('encryptionKey'));
  t.true(isSensitiveKey('tokenCipher'));
  t.true(isSensitiveKey('webhookSecretCipher'));
  t.true(isSensitiveKey('authorization'));
  t.true(isSensitiveKey('cookie'));

  t.false(isSensitiveKey('workspaceId'));
  t.false(isSensitiveKey('taskKey'));
  t.false(isSensitiveKey('provider'));
  t.false(isSensitiveKey('connectionId'));
  t.false(isSensitiveKey('event'));
});

test('redacts sensitive values recursively by key', t => {
  const input = {
    workspaceId: 'ws-1',
    connection: {
      token: 'glpat-abcdefghijklmnopqrstuvwxyz123456',
      webhookSecretCipher: 'cipher:abc',
      name: 'My GitLab',
    },
    list: [{ password: 'hunter2' }, { safe: 'value' }],
  };

  const result = redactValue(input) as typeof input;

  t.is(result.workspaceId, 'ws-1');
  t.is(result.connection.token, REDACTED);
  t.is(result.connection.webhookSecretCipher, REDACTED);
  t.is(result.connection.name, 'My GitLab');
  t.is(result.list[0].password, REDACTED);
  t.is(result.list[1].safe, 'value');
});

test('redacts embedded credential patterns in strings', t => {
  t.is(
    redactString('Authorization: Bearer abc123def456'),
    'Authorization: ' + REDACTED
  );
  t.is(redactString('token=supersecrettokenvalue123'), 'token=' + REDACTED);
  t.is(
    redactString('apiKey: sk-abcdefghijklmnopqrstuvwxyz123456'),
    'apiKey: ' + REDACTED
  );
  t.is(redactString('glpat-abcdefghijklmnopqrstuvwxyz123456'), REDACTED);
  t.is(redactString('ghp_abcdefghijklmnopqrstuvwxyz123456789012'), REDACTED);
  t.is(redactString('xoxb-1234567890-abcdefghij'), REDACTED);
});

test('keeps safe strings untouched', t => {
  const safe = 'Webhook received for connection abc (gitlab)';
  t.is(redactString(safe), safe);
  t.is(
    redactString('Linked webhook event [commit.pushed] for keys [TW-142]'),
    'Linked webhook event [commit.pushed] for keys [TW-142]'
  );
});

test('redacts secrets inside error stacks', t => {
  const error = new Error(
    'Failed to connect with token glpat-abcdefghijklmnopqrstuvwxyz123456'
  );
  const result = redactString(error.stack ?? '');
  t.false(result.includes('glpat-abcdefghijklmnopqrstuvwxyz123456'));
  t.true(result.includes(REDACTED));
});

test('does not mutate the original value', t => {
  const input = { token: 'secret-value' };
  const result = redactValue(input);
  t.is(input.token, 'secret-value');
  t.is((result as Record<string, unknown>).token, REDACTED);
});

test('handles null, undefined, arrays and nested errors', t => {
  t.is(redactValue(null), null);
  t.is(redactValue(undefined), undefined);
  t.deepEqual(redactValue([1, 'two', { token: 'x' }]), [
    1,
    'two',
    { token: REDACTED },
  ]);
  t.is(redactValue(42), 42);
});
