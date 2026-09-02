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
  CreateDevelopmentBranchInput,
  CreateDevelopmentIntegrationInput,
  CreateDevelopmentMergeRequestInput,
  DevelopmentActivityConnectionType,
  DevelopmentBranchCreatedType,
  DevelopmentConnectionTestResultType,
  DevelopmentIntegrationConnectionType,
  DevelopmentMergeRequestCreatedType,
  DevelopmentPipelineType,
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
    username: string | null;
    tokenCipher: string;
    webhookSecretCipher: string | null;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
  url: URLHelper
): DevelopmentIntegrationConnectionType => ({
  repositories: [],
  id: connection.id,
  workspaceId: connection.workspaceId,
  provider: connection.provider,
  name: connection.name,
  baseUrl: connection.baseUrl,
  username: connection.username ?? undefined,
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
      .assert('Workspace.TrackWork.Integrations.Manage');

    const records = await this.connections.listByWorkspace(workspace.id);

    const repositories = await Promise.all(
      records.map(record =>
        this.connections.listRepositoriesByConnection(record.id)
      )
    );

    return records.map((record, index) => ({
      ...mapConnectionToType(record, this.url),
      repositories: repositories[index]!.map(repository => ({
        id: repository.id,
        connectionId: repository.connectionId,
        externalId: repository.externalId,
        name: repository.name,
        fullName: repository.fullName,
        webUrl: repository.webUrl,
        defaultBranch: repository.defaultBranch,
        enabled: repository.enabled,
        createdAt: repository.createdAt,
      })),
    }));
  }
}

@Resolver()
export class DevelopmentInfoResolver {
  constructor(
    private readonly links: DevelopmentLinkService,
    private readonly connections: IntegrationConnectionService,
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
    const repositories = await this.connections.listRepositoriesByIds(
      links.map(link => link.repositoryId).filter(Boolean)
    );

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

    const pipelines = links
      .filter(link => link.entityType === 'pipeline')
      .map(link => ({
        externalId: link.externalId,
        number: link.iid ?? link.externalId,
        name: link.title,
        url: link.url,
        status: link.status ?? 'unknown',
        startedAt: (link.metadata as { startedAt?: string }).startedAt
          ? new Date((link.metadata as { startedAt: string }).startedAt)
          : null,
        finishedAt: (link.metadata as { finishedAt?: string }).finishedAt
          ? new Date((link.metadata as { finishedAt: string }).finishedAt)
          : null,
      }));

    return {
      repositories: [
        ...new Set(repositories.map(repository => repository.fullName)),
      ],
      commits,
      branches,
      mergeRequests,
      pipelines,
    };
  }

  @Query(() => DevelopmentActivityConnectionType)
  async trackWorkActivity(
    @CurrentUser() user: CurrentUser | null,
    @Args('workspaceId') workspaceId: string,
    @Args('taskKey', { nullable: true }) taskKey?: string,
    @Args('first', { nullable: true, defaultValue: 20 }) first?: number,
    @Args('after', { nullable: true }) after?: string
  ) {
    if (!user) {
      throw new AuthenticationRequired();
    }

    await this.access
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Read');

    const { nodes, nextCursor, hasNextPage } = await this.links.listActivity({
      workspaceId,
      taskKey,
      first: Math.min(first ?? 20, 50),
      after,
    });

    return {
      items: nodes.map(node => ({
        id: node.id,
        taskKey: node.taskKey,
        eventType: node.eventType,
        title: node.title,
        url: node.url,
        authorName: node.authorName,
        repositoryName: node.repositoryName,
        createdAt: node.createdAt,
      })),
      nextCursor,
      hasNextPage,
    };
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
      .assert('Workspace.TrackWork.Integrations.Manage');
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
      provider: input.provider as 'gitlab' | 'jenkins',
      name: input.name,
      baseUrl: input.baseUrl,
      token: input.token,
      webhookSecret: input.webhookSecret,
      username: input.username,
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
      baseUrl: input.baseUrl,
      username: input.username,
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

  @Mutation(() => DevelopmentBranchCreatedType)
  async createDevelopmentBranch(
    @CurrentUser() user: CurrentUser | null,
    @Args('input') input: CreateDevelopmentBranchInput
  ) {
    if (!user) {
      throw new AuthenticationRequired();
    }

    const connection = await this.connections.get(input.connectionId);
    await this.assertCanManage(user.id, connection.workspaceId);

    return this.connections.createBranch(
      input.connectionId,
      input.repositoryId,
      input.baseBranch,
      input.name,
      input.taskKey
    );
  }

  @Mutation(() => DevelopmentMergeRequestCreatedType)
  async createDevelopmentMergeRequest(
    @CurrentUser() user: CurrentUser | null,
    @Args('input') input: CreateDevelopmentMergeRequestInput
  ) {
    if (!user) {
      throw new AuthenticationRequired();
    }

    const connection = await this.connections.get(input.connectionId);
    await this.assertCanManage(user.id, connection.workspaceId);

    return this.connections.createMergeRequest(
      input.connectionId,
      input.repositoryId,
      input.sourceBranch,
      input.targetBranch,
      input.title,
      input.description ?? undefined,
      input.taskKey
    );
  }

  @Mutation(() => [DevelopmentPipelineType])
  async refreshDevelopmentPipelines(
    @CurrentUser() user: CurrentUser | null,
    @Args('connectionId') connectionId: string
  ) {
    if (!user) {
      throw new AuthenticationRequired();
    }

    const connection = await this.connections.get(connectionId);
    await this.assertCanManage(user.id, connection.workspaceId);

    const pipelines = await this.connections.refreshPipelines(connectionId);

    return pipelines.map(pipeline => ({
      externalId: pipeline.externalId,
      number: pipeline.number,
      name: pipeline.name,
      status: pipeline.status,
      url: pipeline.url,
      startedAt: pipeline.startedAt,
      finishedAt: pipeline.finishedAt,
    }));
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
