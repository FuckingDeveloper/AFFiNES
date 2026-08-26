import test from 'ava';
import Sinon from 'sinon';

import { JenkinsCiProvider, validateJenkinsBaseUrl } from '../jenkins';

const provider = new JenkinsCiProvider();

const mockFetch = (response: { status: number; body: unknown }) => {
  return Sinon.stub(globalThis, 'fetch').resolves({
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    json: async () => response.body,
    text: async () => JSON.stringify(response.body),
  } as Response);
};

test.afterEach(() => {
  Sinon.restore();
});

test('testConnection returns ok with the node name', async t => {
  mockFetch({ status: 200, body: { nodeName: 'build-node-1' } });

  const result = await provider.testConnection({
    baseUrl: 'https://ci.example.org',
    username: 'admin',
    token: 'token',
  });

  t.true(result.ok);
  t.is(result.message, 'Connected to build-node-1');
});

test('testConnection returns failure on auth errors', async t => {
  const fetchStub = mockFetch({ status: 401, body: {} });

  const result = await provider.testConnection({
    baseUrl: 'https://ci.example.org',
    username: 'admin',
    token: 'wrong',
  });

  t.false(result.ok);
  t.true(fetchStub.calledOnce);
});

test('uses basic auth with username and token', async t => {
  const fetchStub = mockFetch({ status: 200, body: { nodeName: 'x' } });

  await provider.testConnection({
    baseUrl: 'https://ci.example.org',
    username: 'admin',
    token: 'secret-token',
  });

  const [_, init] = fetchStub.firstCall.args;
  const headers = (init as RequestInit).headers as Record<string, string>;
  t.is(
    headers['Authorization'],
    `Basic ${Buffer.from('admin:secret-token').toString('base64')}`
  );
});

test('maps jenkins build states to provider-neutral statuses', async t => {
  const jobs = [
    {
      name: 'build-backend',
      color: 'blue',
      builds: [
        {
          number: 1,
          result: 'SUCCESS',
          building: false,
          timestamp: 1000,
          duration: 500,
          url: 'http://jenkins/job/build-backend/1/',
        },
        {
          number: 2,
          result: null,
          building: true,
          timestamp: 2000,
          url: 'http://jenkins/job/build-backend/2/',
        },
      ],
    },
    {
      name: 'deploy',
      color: 'red',
      builds: [
        {
          number: 7,
          result: 'FAILURE',
          building: false,
          timestamp: 3000,
          duration: 100,
          url: 'http://jenkins/job/deploy/7/',
        },
        {
          number: 8,
          result: 'UNSTABLE',
          building: false,
          timestamp: 4000,
          duration: 200,
          url: 'http://jenkins/job/deploy/8/',
        },
        {
          number: 9,
          result: 'ABORTED',
          building: false,
          timestamp: 5000,
          duration: 300,
          url: 'http://jenkins/job/deploy/9/',
        },
        {
          number: 10,
          result: 'NOT_BUILT',
          building: false,
          timestamp: 6000,
          duration: 400,
          url: 'http://jenkins/job/deploy/10/',
        },
        {
          number: 11,
          result: null,
          building: false,
          timestamp: 7000,
          duration: 500,
          url: 'http://jenkins/job/deploy/11/',
        },
      ],
    },
  ];

  mockFetch({ status: 200, body: { jobs } });

  const pipelines = await provider.listPipelines({
    baseUrl: 'https://ci.example.org',
    username: 'admin',
    token: 'token',
  });

  t.is(pipelines.length, 7);
  t.is(pipelines[0].externalId, 'build-backend#1');
  t.is(pipelines[0].status, 'success');
  t.is(pipelines[0].number, '1');
  t.is(pipelines[1].status, 'running');
  t.is(pipelines[2].status, 'failed');
  t.is(pipelines[3].status, 'unstable');
  t.is(pipelines[4].status, 'canceled');
  t.is(pipelines[5].status, 'skipped');
  t.is(pipelines[6].status, 'unknown');
  t.is(pipelines[2].url, 'http://jenkins/job/deploy/7/');
  t.truthy(pipelines[0].finishedAt);
  t.is(pipelines[1].finishedAt, undefined);
});

test('respects the pipeline limit', async t => {
  const jobs = [
    {
      name: 'job-a',
      color: 'blue',
      builds: [
        {
          number: 1,
          result: 'SUCCESS',
          building: false,
          timestamp: 1,
          url: 'u1',
        },
        {
          number: 2,
          result: 'SUCCESS',
          building: false,
          timestamp: 2,
          url: 'u2',
        },
      ],
    },
    {
      name: 'job-b',
      color: 'blue',
      builds: [
        {
          number: 1,
          result: 'SUCCESS',
          building: false,
          timestamp: 3,
          url: 'u3',
        },
        {
          number: 2,
          result: 'SUCCESS',
          building: false,
          timestamp: 4,
          url: 'u4',
        },
      ],
    },
  ];

  mockFetch({ status: 200, body: { jobs } });

  const pipelines = await provider.listPipelines({
    baseUrl: 'https://ci.example.org',
    username: 'admin',
    token: 'token',
    limit: 3,
  });

  t.is(pipelines.length, 3);
});

test('validateJenkinsBaseUrl rejects non-http schemes', t => {
  t.throws(() => validateJenkinsBaseUrl('ftp://ci.example.org'));
  t.throws(() => validateJenkinsBaseUrl('not-a-url'));
  t.is(
    validateJenkinsBaseUrl('https://ci.example.org:8080/'),
    'https://ci.example.org:8080'
  );
});
