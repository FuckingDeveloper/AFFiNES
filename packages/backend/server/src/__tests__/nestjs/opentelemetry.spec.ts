import { get as httpGet } from 'node:http';

import test from 'ava';

import { AppModule } from '../../app.module';
import { ConfigFactory, ConfigModule } from '../../base/config';
import { EventBus } from '../../base/event';
import { metrics } from '../../base/metrics';
import { createTestingApp, TestingApp } from '../utils';

const METRICS_PORT = 19466;
const METRICS_URL = `http://127.0.0.1:${METRICS_PORT}/metrics`;

const scrape = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    const req = httpGet(METRICS_URL, { agent: false }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end();
  });
};

const waitForMetrics = async (timeout = 10_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const body = await scrape();
      if (body.length > 0) {
        return body;
      }
    } catch {
      // exporter server may still be starting
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('metrics endpoint did not come up');
};

const waitForShutdown = async (timeout = 10_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      await scrape();
    } catch {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('metrics endpoint did not shut down');
};

const seriesOf = (body: string, name: string) => {
  const lines = body
    .split('\n')
    .filter(line => new RegExp(`^${name}(?:\\{|\\s)`).test(line));
  return { total: lines.length, unique: new Set(lines).size };
};

const toggleMetrics = async (app: TestingApp, enabled: boolean) => {
  app.get(ConfigFactory).override({ metrics: { enabled } });
  await app.get(EventBus).emitAsync('config.changed', {
    updates: { metrics: { enabled } },
  });
};

const recordTrackWorkMetric = () => {
  metrics.trackwork.counter('webhook_received').add(1, { provider: 'gitlab' });
};

test('metrics lifecycle re-enable restores host and TrackWork metrics', async t => {
  const app = await createTestingApp({
    imports: [
      ConfigModule.override({
        metrics: { enabled: true, host: '127.0.0.1', port: METRICS_PORT },
      }),
      AppModule,
    ],
  });
  t.teardown(() => app.close());

  let body = await waitForMetrics();
  const system = seriesOf(body, 'system_memory_usage');
  t.is(system.total, 2);
  t.is(system.unique, 2);
  const process = seriesOf(body, 'process_memory_usage');
  t.is(process.total, 1);
  t.is(process.unique, 1);

  recordTrackWorkMetric();
  body = await waitForMetrics();
  t.is(seriesOf(body, 'trackwork_webhook_received_total').unique, 1);

  await toggleMetrics(app, false);
  await waitForShutdown();

  await toggleMetrics(app, true);
  body = await waitForMetrics();
  const system2 = seriesOf(body, 'system_memory_usage');
  t.is(system2.total, 2);
  t.is(system2.unique, 2);
  t.is(seriesOf(body, 'process_memory_usage').unique, 1);

  recordTrackWorkMetric();
  body = await waitForMetrics();
  t.is(seriesOf(body, 'trackwork_webhook_received_total').unique, 1);

  await toggleMetrics(app, false);
  await waitForShutdown();
  await toggleMetrics(app, true);
  body = await waitForMetrics();
  const system3 = seriesOf(body, 'system_memory_usage');
  t.is(system3.total, 2);
  t.is(system3.unique, 2);
  t.is(seriesOf(body, 'process_memory_usage').unique, 1);

  recordTrackWorkMetric();
  body = await waitForMetrics();
  t.is(seriesOf(body, 'trackwork_webhook_received_total').unique, 1);
});
