import { getQueueToken } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import test from 'ava';
import { Queue as Bullmq, Worker } from 'bullmq';
import { CLS_ID, ClsServiceManager } from 'nestjs-cls';
import Sinon from 'sinon';

import { createTestingModule } from '../../../../__tests__/utils';
import { ConfigModule } from '../../../config';
import { metrics } from '../../../metrics';
import { JobExecutor } from '../executor';
import { JobModule, JobQueue, OnJob } from '../index';
import { JobHandlerScanner } from '../scanner';

let module: TestingModule;
let queue: JobQueue;
let executor: JobExecutor;
let worker: Worker;
let bullmq: Bullmq;

declare global {
  interface Jobs {
    'nightly.__test__job': {
      name: string;
    };
    'nightly.__test__job2': {
      name: string;
    };
    'nightly.__test__throw': any;
    'nightly.__test__requestId': any;
  }
}

@Injectable()
class JobHandlers {
  @OnJob('nightly.__test__job')
  @OnJob('nightly.__test__job2')
  async handleJob(job: Jobs['nightly.__test__job']) {
    return job.name;
  }

  @OnJob('nightly.__test__throw')
  async throwJob() {
    throw new Error('Throw in job handler');
  }
}

test.before(async () => {
  module = await createTestingModule({
    imports: [
      ConfigModule.override({
        job: {
          worker: {
            // NOTE(@forehalo):
            //   bullmq will hold the connection to check stalled jobs,
            //   which will keep the test process alive to timeout.
            stalledInterval: 100,
          },
        },
      }),
      JobModule.forRoot(),
    ],
    providers: [JobHandlers],
    tapModule: builder => {
      // use real JobQueue for testing
      builder.overrideProvider(JobQueue).useClass(JobQueue);
    },
  });

  queue = module.get(JobQueue);
  executor = module.get(JobExecutor);
  bullmq = module.get(getQueueToken('nightly'), { strict: false });
  // @ts-expect-error private api
  worker = executor.workers.get('nightly')!;
  await worker.pause();
});

test.beforeEach(async () => {
  await bullmq.obliterate({ force: true });
  await bullmq.resume();
});

test.after.always(async () => {
  await module.close();
});

// #region scanner
test('should register job handler', async t => {
  const scanner = module.get(JobHandlerScanner);

  const handler = scanner.getHandler('nightly.__test__job');

  t.is(handler!.name, 'JobHandlers.handleJob');
  t.is(typeof handler!.fn, 'function');
});
// #endregion

// #region queue
test('should add job to queue', async t => {
  const job = await queue.add('nightly.__test__job', { name: 'test' });

  const queuedJob = await queue.get(job.id!, job.name as JobName);

  t.is(queuedJob!.name, job.name);
});

test('should remove job from queue', async t => {
  const job = await queue.add('nightly.__test__job', { name: 'test' });

  const data = await queue.remove(job.id!, 'nightly.__test__job');

  t.deepEqual(data, { name: 'test' });

  const nullData = await queue.remove(job.id!, job.name as JobName);
  const nullJob = await bullmq.getJob(job.id!);

  t.is(nullData, undefined);
  t.is(nullJob, undefined);
});
// #endregion

// #region executor
test('should dispatch job handler', async t => {
  const handlers = module.get(JobHandlers);
  const spy = Sinon.spy(handlers, 'handleJob');

  await executor.run('nightly.__test__job', { name: 'test executor' });

  t.true(spy.calledOnceWithExactly({ name: 'test executor' }));
});

test('should record job failure metric when handler throws', async t => {
  const failedStub = Sinon.stub(metrics.queue.counter('job_failed'), 'add');

  await t.throwsAsync(
    executor.run('nightly.__test__throw', { name: 'test executor' }, 'test-id'),
    {
      message: 'Throw in job handler',
    }
  );

  const call = failedStub
    .getCalls()
    .find(call => call.args[1]?.job === 'nightly.__test__throw');
  t.truthy(call);
  t.deepEqual(call!.args, [
    1,
    { queue: 'nightly', job: 'nightly.__test__throw' },
  ]);

  failedStub.restore();
});

test('should be able to record job metrics', async t => {
  const counterStub = Sinon.stub(
    metrics.queue.counter('function_calls'),
    'add'
  );
  const timerStub = Sinon.stub(
    metrics.queue.histogram('function_timer'),
    'record'
  );

  const jobHandlerCalls = (job: string) => [
    [1, { queue: 'nightly' }],
    [
      1,
      {
        name: 'job_handler',
        job,
        namespace: 'nightly',
        handler: 'JobHandlers.handleJob',
        error: false,
      },
    ],
    [-1, { queue: 'nightly' }],
  ];

  await executor.run('nightly.__test__job', { name: 'test executor' });

  t.deepEqual(counterStub.args, jobHandlerCalls('nightly.__test__job'));
  t.deepEqual(timerStub.firstCall.args[1], {
    name: 'job_handler',
    job: 'nightly.__test__job',
    namespace: 'nightly',
    handler: 'JobHandlers.handleJob',
    error: false,
  });

  counterStub.reset();
  timerStub.reset();

  await executor.run('nightly.__test__job2', { name: 'test executor' });

  t.deepEqual(counterStub.args, jobHandlerCalls('nightly.__test__job2'));
  t.deepEqual(timerStub.firstCall.args[1], {
    name: 'job_handler',
    job: 'nightly.__test__job2',
    namespace: 'nightly',
    handler: 'JobHandlers.handleJob',
    error: false,
  });

  counterStub.reset();
  timerStub.reset();

  await t.throwsAsync(
    executor.run('nightly.__test__throw', { name: 'test executor' }, 'test-id'),
    {
      message: 'Throw in job handler',
    }
  );

  t.deepEqual(counterStub.args, [
    [1, { queue: 'nightly' }],
    [1, { queue: 'nightly', job: 'nightly.__test__throw' }],
    [
      1,
      {
        name: 'job_handler',
        job: 'nightly.__test__throw',
        namespace: 'nightly',
        handler: 'JobHandlers.throwJob',
        error: true,
      },
    ],
    [-1, { queue: 'nightly' }],
  ]);
  t.deepEqual(timerStub.firstCall.args[1], {
    name: 'job_handler',
    job: 'nightly.__test__throw',
    namespace: 'nightly',
    handler: 'JobHandlers.throwJob',
    error: true,
  });
});

test('should propagate the CLS request id into queued job data', async t => {
  const cls = ClsServiceManager.getClsService();

  const jobId = await cls.run(async () => {
    cls.set(CLS_ID, 'selfhosted:job:test-request-id');
    const job = await queue.add('nightly.__test__job', { name: 'req-id' });
    return job.id!;
  });

  const queued = await queue.get(jobId, 'nightly.__test__job');
  t.is(
    (queued!.data as { $$requestId: string }).$$requestId,
    'selfhosted:job:test-request-id'
  );
  t.deepEqual((queued!.data as { payload: unknown }).payload, {
    name: 'req-id',
  });
});
// #endregion
