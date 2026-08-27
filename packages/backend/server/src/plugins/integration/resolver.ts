import {
  Args,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';

import { AuthenticationRequired, URLHelper } from '../../base';
import { CurrentUser } from '../../core/auth';
import { AccessController } from '../../core/permission';
import { WorkspaceType } from '../../core/workspaces';
import { DevelopmentLinkService } from './link-service';
import { IntegrationConnectionService } from './service';
import {
  CreateDevelopmentIntegrationInput,
  DevelopmentConnectionTestResultType,
  DevelopmentIntegrationConnectionType,
  DevelopmentRepositoryInfoType,
  DevelopmentRepositoryType,
  ImportDevelopmentRepositoryInput,
  RotateDevelopmentCredentialsInput,
  TrackWorkDevelopmentInfoType,
  UpdateDevelopmentIntegrationInput,
} from './types';

const mapConnectionToType = (
  connection: {
    id: string;
    workspaceId: string;
    provider: string;
    name: string;
    baseUrl: string;
    tokenCipher: string;
    webhookSecretCipher: string | null;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
  url: URLHelper
): DevelopmentIntegrationConnectionType => ({
  id: connection.id,
  workspaceId: connection.workspaceId,
  provider: connection.provider,
  name: connection.name,
  baseUrl: connection.baseUrl,
  enabled: connection.enabled,
  hasToken: connection.tokenCipher.length > 0,
  hasWebhookSecret: connection.webhookSecretCipher !== null,
  webhookUrl: url.link(
    `/api/integrations/${connection.provider}/webhook/${connection.id}`
  ),
  createdAt: connection.createdAt,
  updatedAt: connection.updatedAt,
});

@Resolver(() => WorkspaceType)
export class WorkspaceIntegrationResolver {
  constructor(
    private readonly connections: IntegrationConnectionService,
    private readonly access: AccessController,
    private readonly url: URLHelper
  ) {}

  @ResolveField(() => [DevelopmentIntegrationConnectionType])
  async developmentIntegrations(
    @CurrentUser() user: CurrentUser | null,
    @Parent() workspace: WorkspaceType
  ) {
    if (!user) {
      throw new AuthenticationRequired();
    }

    await this.access
      .user(user.id)
      .workspace(workspace.id)
      .assert('Workspace.Administrators.Manage');

    const records = await this.connections.listByWorkspace(workspace.id);

    return records.map(record => mapConnectionToType(record, this.url));
  }
}

@Resolver()
export class DevelopmentInfoResolver {
  constructor(
    private readonly links: DevelopmentLinkService,
    private readonly access: AccessController
  ) {}

  @Query(() => TrackWorkDevelopmentInfoType)
  async trackWorkTaskDevelopment(
    @CurrentUser() user: CurrentUser | null,
    @Args('workspaceId') workspaceId: string,
    @Args('taskKey') taskKey: string
  ) {
    if (!user) {
      throw new AuthenticationRequired();
    }

    await this.access
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Read');

    const links = await this.links.listByTaskKey(workspaceId, taskKey);

    const commits = links
      .filter(link => link.entityType === 'commit')
      .map(link => ({
        externalId: link.externalId,
        title: link.title,
        url: link.url,
        shortSha:
          (link.metadata as { shortSha?: string }).shortSha ??
          link.externalId.slice(0, 7),
        authorName: (link.metadata as { authorName?: string }).authorName ?? '',
        committedAt: (link.metadata as { committedAt?: string }).committedAt
          ? new Date((link.metadata as { committedAt: string }).committedAt)
          : null,
        branch: (link.metadata as { branch?: string }).branch ?? null,
      }));

    const branches = links
      .filter(link => link.entityType === 'branch')
      .map(link => ({
        name: link.title,
        url: link.url,
      }));

    const mergeRequests = links
      .filter(link => link.entityType === 'merge_request')
      .map(link => ({
        externalId: link.externalId,
        iid: link.iid ?? link.externalId,
        title: link.title,
        url: link.url,
        status: link.status ?? 'unknown',
        sourceBranch:
          (link.metadata as { sourceBranch?: string }).sourceBranch ?? null,
        targetBranch:
          (link.metadata as { targetBranch?: string }).targetBranch ?? null,
      }));

    return { commits, branches, mergeRequests };
  }
}

@Resolver(() => DevelopmentIntegrationConnectionType)
export class IntegrationMutationResolver {
  constructor(
    private readonly connections: IntegrationConnectionService,
    private readonly access: AccessController,
    private readonly url: URLHelper
  ) {}

  private async assertCanManage(
    userId: string,
    workspaceId: string
  ): Promise<void> {
    await this.access
      .user(userId)
      .workspace(workspaceId)
      .assert('Workspace.Administrators.Manage');
  }

  @Mutation(() => DevelopmentIntegrationConnectionType)
  async createDevelopmentIntegration(
    @CurrentUser() user: CurrentUser | null,
    @Args('input') input: CreateDevelopmentIntegrationInput
  ) {
    if (!user) {
      throw new AuthenticationRequired();
    }

    await this.assertCanManage(user.id, input.workspaceId);

    const record = await this.connections.create({
      workspaceId: input.workspaceId,
      provider: input.provider as 'gitlab',
      name: input.name,
      baseUrl: input.baseUrl,
      token: input.token,
      webhookSecret: input.webhookSecret,
      createdById: user.id,
    });

    return mapConnectionToType(record, this.url);
  }

  @Mutation(() => DevelopmentIntegrationConnectionType)
  async updateDevelopmentIntegration(
    @CurrentUser() user: CurrentUser | null,
    @Args('input') input: UpdateDevelopmentIntegrationInput
  ) {
    if (!user) {
      throw new AuthenticationRequired();
    }

    const connection = await this.connections.get(input.id);
    await this.assertCanManage(user.id, connection.workspaceId);

    const record = await this.connections.update({
      id: input.id,
      name: input.name,
      enabled: input.enabled,
    });

    return mapConnectionToType(record, this.url);
  }

  @Mutation(() => DevelopmentIntegrationConnectionType)
  async rotateDevelopmentIntegrationCredentials(
    @CurrentUser() user: CurrentUser | null,
    @Args('input') input: RotateDevelopmentCredentialsInput
  ) {
    if (!user) {
      throw new AuthenticationRequired();
    }

    const connection = await this.connections.get(input.id);
    await this.assertCanManage(user.id, connection.workspaceId);

    const record = await this.connections.rotateCredentials({
      id: input.id,
      token: input.token,
      webhookSecret: input.webhookSecret,
    });

    return mapConnectionToType(record, this.url);
  }

  @Mutation(() => Boolean)
  async deleteDevelopmentIntegration(
    @CurrentUser() user: CurrentUser | null,
    @Args('connectionId') connectionId: string
  ) {
    if (!user) {
      throw new AuthenticationRequired();
    }

    const connection = await this.connections.get(connectionId);
    await this.assertCanManage(user.id, connection.workspaceId);

    await this.connections.delete(connectionId);

    return true;
  }

  @Mutation(() => DevelopmentConnectionTestResultType)
  async testDevelopmentIntegration(
    @CurrentUser() user: CurrentUser | null,
    @Args('connectionId') connectionId: string
  ) {
    if (!user) {
      throw new AuthenticationRequired();
    }

    const connection = await this.connections.get(connectionId);
    await this.assertCanManage(user.id, connection.workspaceId);

    return this.connections.testConnection(connectionId);
  }

  @Mutation(() => [DevelopmentRepositoryInfoType])
  async developmentRepositories(
    @CurrentUser() user: CurrentUser | null,
    @Args('connectionId') connectionId: string
  ) {
    if (!user) {
      throw new AuthenticationRequired();
    }

    const connection = await this.connections.get(connectionId);
    await this.assertCanManage(user.id, connection.workspaceId);

    const [remote, stored] = await Promise.all([
      this.connections.listRepositories(connectionId),
      this.connections.listRepositoriesByConnection(connectionId),
    ]);

    const storedByExternalId = new Map(
      stored.map(repository => [repository.externalId, repository])
    );

    return remote.map(repository => {
      const record = storedByExternalId.get(repository.externalId);

      return {
        ...repository,
        imported: record !== undefined,
        enabled: record?.enabled ?? false,
      };
    });
  }

  @Mutation(() => DevelopmentRepositoryType)
  async importDevelopmentRepository(
    @CurrentUser() user: CurrentUser | null,
    @Args('input') input: ImportDevelopmentRepositoryInput
  ) {
    if (!user) {
      throw new AuthenticationRequired();
    }

    const connection = await this.connections.get(input.connectionId);
    await this.assertCanManage(user.id, connection.workspaceId);

    return this.connections.importRepository(input.connectionId, {
      externalId: input.externalId,
      name: input.name,
      fullName: input.fullName,
      webUrl: input.webUrl,
      defaultBranch: input.defaultBranch ?? undefined,
    });
  }

  @Mutation(() => DevelopmentRepositoryType)
  async setDevelopmentRepositoryEnabled(
    @CurrentUser() user: CurrentUser | null,
    @Args('repositoryId') repositoryId: string,
    @Args('enabled') enabled: boolean
  ) {
    if (!user) {
      throw new AuthenticationRequired();
    }

    const repository = await this.connections.getRepository(repositoryId);
    const connection = await this.connections.get(repository.connectionId);
    await this.assertCanManage(user.id, connection.workspaceId);

    return this.connections.setRepositoryEnabled(repositoryId, enabled);
  }
}
