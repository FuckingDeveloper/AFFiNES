import {
  Args,
  Field,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';

import { AuthenticationRequired } from '../../base';
import { CurrentUser, CurrentUser as CurrentUserType } from '../../core/auth';
import { AccessController } from '../../core/permission';
import { TrackWorkWorkflowService } from './workflow.service';

@ObjectType()
export class TrackWorkWorkflowConfigType {
  @Field(() => Int)
  revision!: number;

  @Field(() => GraphQLJSON)
  config!: unknown;
}

@InputType()
export class UpdateTrackWorkWorkflowConfigInput {
  @Field()
  workspaceId!: string;

  @Field(() => Int)
  expectedRevision!: number;

  @Field(() => GraphQLJSON)
  config!: unknown;
}

@Resolver()
export class TrackWorkWorkflowResolver {
  constructor(
    private readonly workflow: TrackWorkWorkflowService,
    private readonly access: AccessController
  ) {}

  @Query(() => TrackWorkWorkflowConfigType)
  async trackWorkWorkflowConfig(
    @CurrentUser() user: CurrentUserType,
    @Args('workspaceId') workspaceId: string
  ) {
    if (!user) {
      throw new AuthenticationRequired();
    }
    await this.access
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Read');
    return this.workflow.get(workspaceId);
  }

  @Mutation(() => TrackWorkWorkflowConfigType)
  async updateTrackWorkWorkflowConfig(
    @CurrentUser() user: CurrentUserType,
    @Args('input') input: UpdateTrackWorkWorkflowConfigInput
  ) {
    if (!user) {
      throw new AuthenticationRequired();
    }
    await this.access
      .user(user.id)
      .workspace(input.workspaceId)
      .assert('Workspace.TrackWork.Workflow.Manage');
    return this.workflow.update(
      { id: user.id, email: user.email },
      input.workspaceId,
      input.expectedRevision,
      input.config
    );
  }
}
