import { getQueueToken } from '@nestjs/bullmq';
import test from 'ava';
import Sinon from 'sinon';

import { metrics } from '../../../metrics';
import { QueueMetricsService } from '../queue-metrics';

const fakeCounts = {
  waiting: 3,
  active: 1,
  delayed: 2,
  failed: 1,
  completed: 10,
};

test('records queue depth gauges from getJobCounts', async t => {
  const fakeQueue = {
    getJobCounts: Sinon.stub().resolves(fakeCounts),
  };
  const fakeRef = {
    get: (token: string, _opts: unknown) => {
      if (token !== getQueueToken('integration')) {
        throw new Error('queue not found');
      }
      return fakeQueue;
    },
  };
  const gaugeStub = Sinon.stub(metrics.queue.gauge('job_depth'), 'record');

  const service = new QueueMetricsService(fakeRef as any);
  await service.collect();

  t.is(gaugeStub.callCount, Object.keys(fakeCounts).length);
  t.deepEqual(gaugeStub.firstCall.args, [
    3,
    { queue: 'integration', state: 'waiting' },
  ]);
  t.deepEqual(
    gaugeStub.getCalls().map(call => call.args[1]),
    [
      { queue: 'integration', state: 'waiting' },
      { queue: 'integration', state: 'active' },
      { queue: 'integration', state: 'delayed' },
      { queue: 'integration', state: 'failed' },
      { queue: 'integration', state: 'completed' },
    ]
  );

  gaugeStub.restore();
});

test('skips queues that are not registered', async t => {
  const fakeRef = {
    get: () => {
      throw new Error('queue not found');
    },
  };
  const gaugeStub = Sinon.stub(metrics.queue.gauge('job_depth'), 'record');

  const service = new QueueMetricsService(fakeRef as any);
  await service.collect();

  t.is(gaugeStub.callCount, 0);

  gaugeStub.restore();
});
