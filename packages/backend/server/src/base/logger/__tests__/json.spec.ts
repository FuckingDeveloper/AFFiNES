import { Writable } from 'node:stream';

import test from 'ava';
import { CLS_ID, ClsServiceManager } from 'nestjs-cls';
import { transports } from 'winston';

import { AFFiNEJsonLogger, createStructuredLogger } from '../json';
import { AFFiNELogger } from '../service';

function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });

  const logger = new AFFiNEJsonLogger(createStructuredLogger());
  const winston = logger.getWinstonLogger();
  winston.clear();
  winston.add(new transports.Stream({ stream }));

  return { logger, lines };
}

test('emits JSON lines with canonical fields', t => {
  const { logger, lines } = captureLogger();

  logger.log({ level: 'info', message: 'Hello', context: 'TestService' });

  t.is(lines.length, 1);
  const parsed = JSON.parse(lines[0]);

  t.is(parsed.level, 'info');
  t.is(parsed.message, 'Hello');
  t.is(parsed.context, 'TestService');
  t.is(parsed.service, 'trackwork-server');
  t.truthy(parsed.timestamp);
});

test('includes structured event fields from object messages', t => {
  const { logger, lines } = captureLogger();

  logger.log({
    level: 'warn',
    message: 'Webhook rejected',
    event: 'scm.webhook.rejected',
    result: 'invalid_signature',
    provider: 'gitlab',
    connectionId: 'conn-1',
    context: 'IntegrationConnectionService',
  });

  const parsed = JSON.parse(lines[0]);
  t.is(parsed.event, 'scm.webhook.rejected');
  t.is(parsed.result, 'invalid_signature');
  t.is(parsed.provider, 'gitlab');
  t.is(parsed.connectionId, 'conn-1');
  t.is(parsed.context, 'IntegrationConnectionService');
});

test('redacts sensitive keys and token patterns in JSON output', t => {
  const { logger, lines } = captureLogger();

  logger.log({
    level: 'info',
    message: 'connection created',
    context: 'IntegrationConnectionService',
    token: 'glpat-abcdefghijklmnopqrstuvwxyz123456',
    nested: { password: 'hunter2', webhookSecretCipher: 'cipher:abc' },
  });

  const parsed = JSON.parse(lines[0]);
  t.is(parsed.token, '[REDACTED]');
  t.is(parsed.nested.password, '[REDACTED]');
  t.is(parsed.nested.webhookSecretCipher, '[REDACTED]');
  const raw = lines[0];
  t.false(raw.includes('glpat-abcdefghijklmnopqrstuvwxyz123456'));
  t.false(raw.includes('hunter2'));
  t.false(raw.includes('cipher:abc'));
});

test('redacts token patterns inside messages and error stacks', t => {
  const { logger, lines } = captureLogger();

  const error = new Error(
    'Provider request failed with token glpat-abcdefghijklmnopqrstuvwxyz123456'
  );
  logger.log({
    level: 'error',
    message: 'scm.webhook.process.failed',
    context: 'IntegrationJob',
    stack: error.stack,
  });

  const raw = lines[0];
  t.false(raw.includes('glpat-abcdefghijklmnopqrstuvwxyz123456'));
  t.true(raw.includes('[REDACTED]'));
});

test('adds requestId from CLS context when present', async t => {
  const { logger, lines } = captureLogger();
  const cls = ClsServiceManager.getClsService();

  await cls.run(async () => {
    cls.set(CLS_ID, 'selfhosted:http:test-request-id');
    logger.log({ level: 'info', message: 'in context' });
  });

  const parsed = JSON.parse(lines[0]);
  t.is(parsed.requestId, 'selfhosted:http:test-request-id');
});

test('omits requestId when no CLS context exists', t => {
  const { logger, lines } = captureLogger();

  logger.log({ level: 'info', message: 'outside context' });

  const parsed = JSON.parse(lines[0]);
  t.is(parsed.requestId, undefined);
});

test('error() preserves stack while sanitizing secrets', t => {
  const { logger, lines } = captureLogger();

  const error = new Error(
    'boom with token glpat-abcdefghijklmnopqrstuvwxyz123456'
  );
  logger.error('job failed', error, 'JobExecutor');

  const raw = lines[0];
  const parsed = JSON.parse(raw);
  t.is(parsed.level, 'error');
  t.is(parsed.message, 'job failed');
  t.is(parsed.context, 'JobExecutor');
  t.true(typeof parsed.stack === 'string');
  t.false(raw.includes('glpat-abcdefghijklmnopqrstuvwxyz123456'));
});

test('AFFiNELogger pretty mode redacts token patterns', t => {
  const logger = new AFFiNELogger();
  logger.setLogLevels(['error']);

  const raw = logger.stringifyMessage(
    'failed with Bearer abc123def456',
    'error'
  );
  t.false(raw.includes('abc123def456'));
  t.true(raw.includes('[REDACTED]'));
});
