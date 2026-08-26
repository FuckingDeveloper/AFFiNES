import { PrismaClient } from '@prisma/client';

import {
  createDevelopmentIntegrationMutation,
  deleteDevelopmentIntegrationMutation,
  developmentIntegrationsQuery,
  updateDevelopmentIntegrationMutation,
} from '@affine/graphql';
import { WorkspaceRole } from '../../../models';
import { app, e2e, Mockers } from '../test';

const createConnectionVariables = (workspaceId: string) => ({
  input: {
    workspaceId,
    provider: 'gitlab',
    name: 'My GitLab',
    baseUrl: 'https://gitlab.example.org',
    token: 'glpat-secret-token',
    webhookSecret: 'super-secret',
  },
});

e2e('admin can create a gitlab connection and list it', async t => {
  const admin = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: admin.id },
  });
  await app.login(admin);

  const res = await app.gql({
    query: createDevelopmentIntegrationMutation,
    variables: createConnectionVariables(workspace.id),
  });

  const connection = res.createDevelopmentIntegration;
  t.is(connection.provider, 'gitlab');
  t.is(connection.baseUrl, 'https://gitlab.example.org');
  t.is(connection.name, 'My GitLab');
  t.true(connection.enabled);
  t.true(connection.hasToken);
  t.true(connection.hasWebhookSecret);
  t.true(
    connection.webhookUrl.endsWith(
      `/api/integrations/gitlab/webhook/${connection.id}`
    )
  );

  const db = app.get(PrismaClient);
  const record = await db.developmentIntegrationConnection.findUniqueOrThrow({
    where: { id: connection.id },
  });

  t.not(record.tokenCipher, 'glpat-secret-token');
  t.not(record.webhookSecretCipher, 'super-secret');

  const list = await app.gql({
    query: developmentIntegrationsQuery,
    variables: { workspaceId: workspace.id },
  });

  t.is(list.workspace.developmentIntegrations.length, 1);
});

e2e('non-admin member cannot create a connection', async t => {
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
      variables: createConnectionVariables(workspace.id),
    })
  );
});

e2e('admin of workspace B cannot touch workspace A connection', async t => {
  const ownerA = await app.create(Mockers.User);
  const workspaceA = await app.create(Mockers.Workspace, {
    owner: { id: ownerA.id },
  });

  await app.login(ownerA);
  const created = await app.gql({
    query: createDevelopmentIntegrationMutation,
    variables: createConnectionVariables(workspaceA.id),
  });
  const connectionId = created.createDevelopmentIntegration.id;

  const ownerB = await app.create(Mockers.User);
  await app.create(Mockers.Workspace, {
    owner: { id: ownerB.id },
  });

  await app.login(ownerB);

  await t.throwsAsync(() =>
    app.gql({
      query: deleteDevelopmentIntegrationMutation,
      variables: { connectionId },
    })
  );

  await t.throwsAsync(() =>
    app.gql({
      query: updateDevelopmentIntegrationMutation,
      variables: { input: { id: connectionId, enabled: false } },
    })
  );
});

e2e('rejects invalid gitlab base urls', async t => {
  const admin = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: admin.id },
  });
  await app.login(admin);

  await t.throwsAsync(() =>
    app.gql({
      query: createDevelopmentIntegrationMutation,
      variables: {
        input: {
          workspaceId: workspace.id,
          provider: 'gitlab',
          name: 'My GitLab',
          baseUrl: 'ftp://gitlab.example.org',
          token: 'glpat-secret-token',
        },
      },
    })
  );
});

e2e('webhook accepts a valid secret and rejects invalid ones', async t => {
  const admin = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: admin.id },
  });
  await app.login(admin);

  const created = await app.gql({
    query: createDevelopmentIntegrationMutation,
    variables: createConnectionVariables(workspace.id),
  });
  const connectionId = created.createDevelopmentIntegration.id;
  const url = `/api/integrations/gitlab/webhook/${connectionId}`;

  const valid = await app
    .POST(url)
    .set('X-Gitlab-Token', 'super-secret')
    .send({ object_kind: 'push', project: { id: 1 }, commits: [] })
    .expect(200);

  t.is(valid.body.accepted, true);

  await app
    .POST(url)
    .set('X-Gitlab-Token', 'wrong-secret')
    .send({ object_kind: 'push' })
    .expect(401);

  await app.POST(url).send({ object_kind: 'push' }).expect(401);

  await app
    .POST('/api/integrations/gitlab/webhook/unknown-connection')
    .send({})
    .expect(404);

  await app.gql({
    query: updateDevelopmentIntegrationMutation,
    variables: { input: { id: connectionId, enabled: false } },
  });

  await app
    .POST(url)
    .set('X-Gitlab-Token', 'super-secret')
    .send({ object_kind: 'push' })
    .expect(404);
});
