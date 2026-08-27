import { Field, InputType, ObjectType } from '@nestjs/graphql';
import type { DevelopmentIntegrationConnection } from '@prisma/client';

export type ScmProviderType = 'gitlab' | 'github' | 'gitea' | 'forgejo';

export type DevelopmentEntityType =
  | 'commit'
  | 'branch'
  | 'merge_request'
  | 'pipeline';

export type MergeRequestStatus =
  | 'open'
  | 'merged'
  | 'closed'
  | 'draft'
  | 'unknown';

export type PipelineStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'failed'
  | 'canceled'
  | 'skipped'
  | 'unstable'
  | 'unknown';

export type RepositoryRef = {
  externalId: string;
  name: string;
  url: string;
};

export type CommitInfo = {
  sha: string;
  shortSha: string;
  message: string;
  authorName: string;
  authorEmail?: string;
  committedAt?: Date;
  url?: string;
  branch?: string;
};

export type BranchInfo = {
  name: string;
  url?: string;
};

export type MergeRequestInfo = {
  externalId: string;
  iid: string;
  title: string;
  url: string;
  sourceBranch: string;
  targetBranch: string;
  status: MergeRequestStatus;
  authorName?: string;
  createdAt?: Date;
  updatedAt?: Date;
  mergedAt?: Date;
};

export type PipelineInfo = {
  provider: string;
  externalId: string;
  number?: string;
  name?: string;
  status: PipelineStatus;
  url?: string;
  commitSha?: string;
  branch?: string;
  startedAt?: Date;
  finishedAt?: Date;
};

export type DevelopmentEvent =
  | {
      type: 'commit.pushed';
      idempotencyKey: string;
      repository: RepositoryRef;
      commit: CommitInfo;
      taskKeys: string[];
    }
  | {
      type: 'branch.updated';
      idempotencyKey: string;
      repository: RepositoryRef;
      branch: BranchInfo;
      taskKeys: string[];
    }
  | {
      type: 'merge_request.opened';
      idempotencyKey: string;
      repository: RepositoryRef;
      mergeRequest: MergeRequestInfo;
      taskKeys: string[];
    }
  | {
      type: 'merge_request.updated';
      idempotencyKey: string;
      repository: RepositoryRef;
      mergeRequest: MergeRequestInfo;
      taskKeys: string[];
    }
  | {
      type: 'merge_request.merged';
      idempotencyKey: string;
      repository: RepositoryRef;
      mergeRequest: MergeRequestInfo;
      taskKeys: string[];
    };

export type RepositoryInfo = {
  externalId: string;
  name: string;
  fullName: string;
  webUrl: string;
  defaultBranch?: string;
};

export type ConnectionTestResult = {
  ok: boolean;
  message?: string;
};

export type ScmConnection = {
  id: string;
  workspaceId: string;
  provider: ScmProviderType;
  baseUrl: string;
  token: string;
  webhookSecret?: string;
  enabled: boolean;
};

export interface ScmProvider {
  readonly type: ScmProviderType;

  testConnection(input: {
    baseUrl: string;
    token: string;
  }): Promise<ConnectionTestResult>;

  listRepositories(input: {
    baseUrl: string;
    token: string;
  }): Promise<RepositoryInfo[]>;

  verifyWebhook(input: {
    headers: Record<string, unknown>;
    body: unknown;
    webhookSecret?: string;
  }): Promise<boolean>;

  parseWebhook(input: { body: unknown }): Promise<DevelopmentEvent[]>;
}

export type IntegrationConnectionRecord = DevelopmentIntegrationConnection;

export type ScmWebhookJobData = {
  connectionId: string;
  provider: ScmProviderType;
  payload: unknown;
};
@ObjectType('DevelopmentIntegrationConnection')
export class DevelopmentIntegrationConnectionType {
  @Field()
  id!: string;

  @Field()
  workspaceId!: string;

  @Field()
  provider!: string;

  @Field()
  name!: string;

  @Field()
  baseUrl!: string;

  @Field()
  enabled!: boolean;

  @Field()
  hasToken!: boolean;

  @Field()
  hasWebhookSecret!: boolean;

  @Field()
  webhookUrl!: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType('DevelopmentRepository')
export class DevelopmentRepositoryType {
  @Field()
  id!: string;

  @Field()
  connectionId!: string;

  @Field()
  externalId!: string;

  @Field()
  name!: string;

  @Field()
  fullName!: string;

  @Field()
  webUrl!: string;

  @Field({ nullable: true })
  defaultBranch?: string;

  @Field()
  enabled!: boolean;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType('DevelopmentRepositoryInfo')
export class DevelopmentRepositoryInfoType {
  @Field()
  externalId!: string;

  @Field()
  name!: string;

  @Field()
  fullName!: string;

  @Field()
  webUrl!: string;

  @Field({ nullable: true })
  defaultBranch?: string;

  @Field()
  imported!: boolean;

  @Field()
  enabled!: boolean;
}

@ObjectType('DevelopmentConnectionTestResult')
export class DevelopmentConnectionTestResultType {
  @Field()
  ok!: boolean;

  @Field({ nullable: true })
  message?: string;
}

@InputType()
export class CreateDevelopmentIntegrationInput {
  @Field()
  workspaceId!: string;

  @Field()
  provider!: string;

  @Field()
  name!: string;

  @Field()
  baseUrl!: string;

  @Field()
  token!: string;

  @Field({ nullable: true })
  webhookSecret?: string;
}

@InputType()
export class UpdateDevelopmentIntegrationInput {
  @Field()
  id!: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  enabled?: boolean;
}

@InputType()
export class RotateDevelopmentCredentialsInput {
  @Field()
  id!: string;

  @Field({ nullable: true })
  token?: string;

  @Field({ nullable: true })
  webhookSecret?: string;
}

@InputType()
export class ImportDevelopmentRepositoryInput {
  @Field()
  connectionId!: string;

  @Field()
  externalId!: string;

  @Field()
  name!: string;

  @Field()
  fullName!: string;

  @Field()
  webUrl!: string;

  @Field({ nullable: true })
  defaultBranch?: string;
}

@ObjectType('DevelopmentCommit')
export class DevelopmentCommitType {
  @Field()
  externalId!: string;

  @Field()
  title!: string;

  @Field()
  url!: string;

  @Field()
  shortSha!: string;

  @Field()
  authorName!: string;

  @Field({ nullable: true })
  committedAt?: Date;

  @Field({ nullable: true })
  branch?: string;
}

@ObjectType('DevelopmentBranch')
export class DevelopmentBranchType {
  @Field()
  name!: string;

  @Field()
  url!: string;
}

@ObjectType('DevelopmentMergeRequest')
export class DevelopmentMergeRequestType {
  @Field()
  externalId!: string;

  @Field()
  iid!: string;

  @Field()
  title!: string;

  @Field()
  url!: string;

  @Field()
  status!: string;

  @Field({ nullable: true })
  sourceBranch?: string;

  @Field({ nullable: true })
  targetBranch?: string;
}

@ObjectType('TrackWorkDevelopmentInfo')
export class TrackWorkDevelopmentInfoType {
  @Field(() => [DevelopmentCommitType])
  commits!: DevelopmentCommitType[];

  @Field(() => [DevelopmentBranchType])
  branches!: DevelopmentBranchType[];

  @Field(() => [DevelopmentMergeRequestType])
  mergeRequests!: DevelopmentMergeRequestType[];
}
