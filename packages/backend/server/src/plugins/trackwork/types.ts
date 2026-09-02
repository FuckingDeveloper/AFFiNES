import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType()
export class TrackWorkLegacyTaskInput {
  @Field()
  docId!: string;

  @Field()
  taskKey!: string;

  @Field(() => [String], { defaultValue: [] })
  relatedDocumentIds!: string[];
}

@InputType()
export class SyncTrackWorkTasksInput {
  @Field()
  workspaceId!: string;

  @Field()
  prefix!: string;

  @Field(() => [TrackWorkLegacyTaskInput])
  tasks!: TrackWorkLegacyTaskInput[];
}

@InputType()
export class AllocateTrackWorkTaskInput {
  @Field()
  workspaceId!: string;

  @Field()
  docId!: string;

  @Field()
  prefix!: string;

  @Field(() => [String], { defaultValue: [] })
  relatedDocumentIds!: string[];

  @Field(() => [TrackWorkLegacyTaskInput], { defaultValue: [] })
  legacyTasks!: TrackWorkLegacyTaskInput[];
}

@InputType()
export class SetTrackWorkTaskDocumentLinksInput {
  @Field()
  workspaceId!: string;

  @Field()
  taskDocId!: string;

  @Field(() => [String])
  documentIds!: string[];
}

@ObjectType('TrackWorkTask')
export class TrackWorkTaskType {
  @Field()
  docId!: string;

  @Field()
  taskKey!: string;

  @Field(() => Int)
  number!: number;

  @Field(() => [String])
  relatedDocumentIds!: string[];

  @Field(() => Date)
  createdAt!: Date;
}
