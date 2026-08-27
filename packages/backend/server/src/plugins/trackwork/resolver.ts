import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import { AuthenticationRequired } from '../../base';
import { CurrentUser } from '../../core/auth';
import { AccessController } from '../../core/permission';
import { TrackWorkRegistryService } from './service';
import {
  AllocateTrackWorkTaskInput,
  SetTrackWorkTaskDocumentLinksInput,
  SyncTrackWorkTasksInput,
  TrackWorkTaskType,
} from './types';

@Resolver()
export class TrackWorkResolver {
  constructor(
    private readonly registry: TrackWorkRegistryService,
    private readonly access: AccessController
  ) {}

  private requireUser(user: CurrentUser | null) {
    if (!user) {
      throw new AuthenticationRequired();
    }
    return user;
  }

  private async filterReadableDocuments(
    userId: string,
    workspaceId: string,
    documentIds: string[]
  ) {
    const readable = await this.access
      .user(userId)
      .workspace(workspaceId)
      .docs(
        documentIds.map(docId => ({ docId })),
        'Doc.Read'
      );
    return readable.map(document => document.docId);
  }

  private async filterTaskLinks(
    userId: string,
    workspaceId: string,
    task: TrackWorkTaskType
  ) {
    return {
      ...task,
      relatedDocumentIds: await this.filterReadableDocuments(
        userId,
        workspaceId,
        task.relatedDocumentIds
      ),
    };
  }

  private async filterReadableTaskInputs(
    userId: string,
    workspaceId: string,
    tasks: Array<{
      docId: string;
      taskKey: string;
      relatedDocumentIds: string[];
    }>
  ) {
    const readableDocumentIds = new Set(
      await this.filterReadableDocuments(userId, workspaceId, [
        ...new Set(tasks.flatMap(task => task.relatedDocumentIds)),
      ])
    );
    return tasks.map(task => ({
      ...task,
      relatedDocumentIds: task.relatedDocumentIds.filter(documentId =>
        readableDocumentIds.has(documentId)
      ),
    }));
  }

  @Mutation(() => [TrackWorkTaskType])
  async syncTrackWorkTasks(
    @CurrentUser() currentUser: CurrentUser | null,
    @Args('input') input: SyncTrackWorkTasksInput
  ) {
    const user = this.requireUser(currentUser);
    await this.access
      .user(user.id)
      .workspace(input.workspaceId)
      .assert('Workspace.CreateDoc');
    const writableTasks = await this.access
      .user(user.id)
      .workspace(input.workspaceId)
      .docs(input.tasks, 'Doc.Update');
    const tasks = await this.filterReadableTaskInputs(
      user.id,
      input.workspaceId,
      writableTasks
    );
    return this.registry.sync(input.workspaceId, input.prefix, tasks, user.id);
  }

  @Mutation(() => TrackWorkTaskType)
  async allocateTrackWorkTask(
    @CurrentUser() currentUser: CurrentUser | null,
    @Args('input') input: AllocateTrackWorkTaskInput
  ) {
    const user = this.requireUser(currentUser);
    await this.access
      .user(user.id)
      .workspace(input.workspaceId)
      .assert('Workspace.CreateDoc');
    const writableLegacyTasks = await this.access
      .user(user.id)
      .workspace(input.workspaceId)
      .docs(input.legacyTasks, 'Doc.Update');
    const legacyTasks = await this.filterReadableTaskInputs(
      user.id,
      input.workspaceId,
      writableLegacyTasks
    );
    const relatedDocumentIds = await this.filterReadableDocuments(
      user.id,
      input.workspaceId,
      input.relatedDocumentIds
    );
    return this.registry.allocate(
      { ...input, legacyTasks, relatedDocumentIds },
      user.id
    );
  }

  @Mutation(() => TrackWorkTaskType)
  async setTrackWorkTaskDocumentLinks(
    @CurrentUser() currentUser: CurrentUser | null,
    @Args('input') input: SetTrackWorkTaskDocumentLinksInput
  ) {
    const user = this.requireUser(currentUser);
    await this.access
      .user(user.id)
      .doc(input.workspaceId, input.taskDocId)
      .assert('Doc.Update');
    const documentIds = await this.filterReadableDocuments(
      user.id,
      input.workspaceId,
      input.documentIds
    );
    return this.registry.setDocumentLinks(
      input.workspaceId,
      input.taskDocId,
      documentIds,
      user.id
    );
  }

  @Query(() => TrackWorkTaskType, { nullable: true })
  async trackWorkTask(
    @CurrentUser() currentUser: CurrentUser | null,
    @Args('workspaceId') workspaceId: string,
    @Args('taskKey') taskKey: string
  ) {
    const user = this.requireUser(currentUser);
    await this.access
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Read');
    const task = await this.registry.getByKey(workspaceId, taskKey);
    if (!task) {
      return null;
    }
    await this.access
      .user(user.id)
      .doc(workspaceId, task.docId)
      .assert('Doc.Read');
    return this.filterTaskLinks(user.id, workspaceId, task);
  }

  @Query(() => [TrackWorkTaskType])
  async trackWorkDocumentBacklinks(
    @CurrentUser() currentUser: CurrentUser | null,
    @Args('workspaceId') workspaceId: string,
    @Args('documentId') documentId: string
  ) {
    const user = this.requireUser(currentUser);
    await this.access
      .user(user.id)
      .doc(workspaceId, documentId)
      .assert('Doc.Read');
    const tasks = await this.registry.getDocumentBacklinks(
      workspaceId,
      documentId
    );
    return this.access
      .user(user.id)
      .workspace(workspaceId)
      .docs(tasks, 'Doc.Read');
  }
}
