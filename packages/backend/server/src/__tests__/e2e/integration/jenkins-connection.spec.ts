import { PrismaClient } from '@prisma/client';
import Sinon from 'sinon';

import {
  createDevelopmentIntegrationMutation,
  deleteDevelopmentIntegrationMutation,
  refreshDevelopmentPipelinesMutation,
  testDevelopmentIntegrationMutation,
  trackWorkTaskDevelopmentQuery,
} from '@affine/graphql';
import { WorkspaceRole } from '../../../models';
import { app, e2e, Mockers } from '../test';

const JENKINS_URL = 'https://ci.example.org';

const createJenkinsConnection = async (workspaceId: string) => {
  const created = await app.gql({
    query: createDevelopmentIntegrationMutation,
    variables: {
      input: {
        workspaceId,
        provider: 'jenkins',
        name: 'CI',
        baseUrl: JENKINS_URL,
        token: 'jenkins-api-token',
        username: 'ci-bot',
      },
    },
  });

  return created.createDevelopmentIntegration;
};

e2e('admin can create, test and delete a jenkins connection', async t => {
  const admin = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: admin.id },
  });
  await app.login(admin);

  const connection = await createJenkinsConnection(workspace.id);

  t.is(connection.provider, 'jenkins');
  t.is(connection.baseUrl, JENKINS_URL);

  const db = app.get(PrismaClient);
  const record = await db.developmentIntegrationConnection.findUniqueOrThrow({
    where: { id: connection.id },
  });

  t.not(record.tokenCipher, 'jenkins-api-token');
  t.is(record.username, 'ci-bot');

  const stub = Sinon.stub(globalThis, 'fetch').resolves({
    ok: true,
    status: 200,
    json: async () => ({ nodeName: 'jenkins-master' }),
    text: async () => '{}',
  } as Response);

  try {
    const testResult = await app.gql({
      query: testDevelopmentIntegrationMutation,
      variables: { connectionId: connection.id },
    });

    t.true(testResult.testDevelopmentIntegration.ok);
  } finally {
    stub.restore();
  }

  await app.gql({
    query: deleteDevelopmentIntegrationMutation,
    variables: { connectionId: connection.id },
  });

  t.is(
    await db.developmentIntegrationConnection.count({
      where: { id: connection.id },
    }),
    0
  );
});

e2e('non-admin member cannot create a jenkins connection', async t => {
  const owner = await app.create(Mockers.User);
  const member = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
    permissions: {
      create: [
        {
          userId: member.id,
          type: WorkspaceRole.Collaborator,
          status: 'Accepted',
        },
      ],
    },
  });

  await app.login(member);

  await t.throwsAsync(() =>
    app.gql({
      query: createDevelopmentIntegrationMutation,
      variables: {
        input: {
          workspaceId: workspace.id,
          provider: 'jenkins',
          name: 'CI',
          baseUrl: JENKINS_URL,
          token: 'jenkins-api-token',
          username: 'ci-bot',
        },
      },
    })
  );
});

e2e('refresh pipelines links jenkins builds to tasks by metadata', async t => {
  const admin = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: admin.id },
  });
  await app.login(admin);

  const connection = await createJenkinsConnection(workspace.id);
  const db = app.get(PrismaClient);

  const stub = Sinon.stub(globalThis, 'fetch').resolves({
    ok: true,
    status: 200,
    json: async () => ({
      jobs: [
        {
          name: 'build-backend',
          color: 'blue',
          builds: [
            {
              number: 42,
              result: 'SUCCESS',
              building: false,
              timestamp: 1724700000000,
              duration: 90000,
              url: `${JENKINS_URL}/job/build-backend/42/`,
              description: 'fix(auth): TW-142 refresh token',
            },
            {
              number: 43,
              result: 'FAILURE',
              building: false,
              timestamp: 1724700100000,
              duration: 80000,
              url: `${JENKINS_URL}/job/build-backend/43/`,
              description: 'TW-142 regression',
            },
          ],
        },
        {
          name: 'TW-151-deploy',
          color: 'red',
          builds: [
            {
              number: 3,
              result: 'UNSTABLE',
              building: false,
              timestamp: 1724700200000,
              duration: 70000,
              url: `${JENKINS_URL}/job/TW-151-deploy/3/`,
              description: null,
            },
          ],
        },
      ],
    }),
    text: async () => '{}',
  } as Response);

  try {
    const result = await app.gql({
      query: refreshDevelopmentPipelinesMutation,
      variables: { connectionId: connection.id },
    });

    t.is(result.refreshDevelopmentPipelines.length, 3);
  } finally {
    stub.restore();
  }

  const pipelines = await db.developmentPipeline.findMany({
    where: { connectionId: connection.id },
    orderBy: { externalId: 'asc' },
  });

  t.is(pipelines.length, 3);

  const deploy = pipelines.find(
    pipeline => pipeline.externalId === 'TW-151-deploy#3'
  );
  t.is(deploy?.status, 'unstable');

  const links = await db.developmentTaskLink.findMany({
    where: { workspaceId: workspace.id, entityType: 'pipeline' },
  });

  t.is(links.length, 3);
  t.true(links.every(link => link.status !== null));

  const devResult = await app.gql({
    query: trackWorkTaskDevelopmentQuery,
    variables: { workspaceId: workspace.id, taskKey: 'TW-142' },
  });

  const pipelinesForTask = devResult.trackWorkTaskDevelopment.pipelines;
  t.is(pipelinesForTask.length, 2);

  const successful = pipelinesForTask.find(
    pipeline => pipeline.number === '42'
  );
  t.is(successful?.status, 'success');
});
