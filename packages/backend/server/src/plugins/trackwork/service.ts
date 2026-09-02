import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import {
  formatTaskKey,
  normalizeTaskKey,
  parseTaskKey,
} from '@affine/trackwork';
import type {
  AllocateTrackWorkTaskInput,
  TrackWorkLegacyTaskInput,
} from './types';

const MAX_SYNC_TASKS = 5000;
const MAX_RELATED_DOCUMENTS = 2000;
const MAX_IDENTIFIER_LENGTH = 255;
const MAX_TASK_NUMBER = 2_147_483_647;
const TASK_PREFIX_RE = /^[A-Z][A-Z0-9]{1,15}$/;

type Transaction = Prisma.TransactionClient;

type TaskWithLinks = Prisma.TrackWorkTaskGetPayload<{
  include: { links: true };
}>;

@Injectable()
export class TrackWorkRegistryService {
  constructor(private readonly prisma: PrismaClient) {}

  private validateIdentifier(value: string, name: string) {
    const normalized = value.trim();
    if (!normalized || normalized.length > MAX_IDENTIFIER_LENGTH) {
      throw new BadRequestException(`Invalid ${name}`);
    }
    return normalized;
  }

  private normalizeRelatedDocumentIds(taskDocId: string, ids: string[]) {
    if (ids.length > MAX_RELATED_DOCUMENTS) {
      throw new BadRequestException('Too many related documents');
    }

    return [
      ...new Set(ids.map(id => this.validateIdentifier(id, 'document id'))),
    ]
      .filter(id => id !== taskDocId)
      .sort();
  }

  private normalizeLegacyTasks(tasks: TrackWorkLegacyTaskInput[]) {
    if (tasks.length > MAX_SYNC_TASKS) {
      throw new BadRequestException('Too many tasks to synchronize');
    }

    return tasks
      .map(task => {
        const docId = this.validateIdentifier(task.docId, 'task document id');
        const taskKey = normalizeTaskKey(task.taskKey);
        const parsed = parseTaskKey(taskKey);
        if (!parsed || parsed.number > MAX_TASK_NUMBER) {
          return null;
        }
        return {
          docId,
          taskKey,
          number: parsed.number,
          relatedDocumentIds: this.normalizeRelatedDocumentIds(
            docId,
            task.relatedDocumentIds
          ),
        };
      })
      .filter(task => task !== null)
      .sort((a, b) => a.docId.localeCompare(b.docId));
  }

  private async lockWorkspace(tx: Transaction, workspaceId: string) {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${workspaceId}, 0))
    `;
  }

  private async initializeLinks(
    tx: Transaction,
    task: { id: string; workspaceId: string; docId: string },
    documentIds: string[],
    createdById: string
  ) {
    if (documentIds.length > 0) {
      await tx.trackWorkDocumentLink.createMany({
        data: documentIds.map(documentId => ({
          workspaceId: task.workspaceId,
          taskId: task.id,
          documentId,
          createdById,
        })),
        skipDuplicates: true,
      });
    }

    await tx.trackWorkTask.update({
      where: { id: task.id },
      data: { linksInitialized: true },
    });
  }

  private async importLegacyTasks(
    tx: Transaction,
    workspaceId: string,
    tasks: TrackWorkLegacyTaskInput[],
    createdById: string
  ) {
    const normalized = this.normalizeLegacyTasks(tasks);
    const existing = await tx.trackWorkTask.findMany({
      where: { workspaceId },
      include: { links: true },
    });
    const byDocId = new Map(existing.map(task => [task.docId, task]));
    const occupiedKeys = new Set(existing.map(task => task.taskKey));
    const occupiedNumbers = new Set(existing.map(task => task.number));

    for (const legacy of normalized) {
      let task = byDocId.get(legacy.docId);
      if (!task) {
        if (
          occupiedKeys.has(legacy.taskKey) ||
          occupiedNumbers.has(legacy.number)
        ) {
          continue;
        }

        task = await tx.trackWorkTask.create({
          data: {
            workspaceId,
            docId: legacy.docId,
            taskKey: legacy.taskKey,
            number: legacy.number,
            createdById,
          },
          include: { links: true },
        });
        byDocId.set(task.docId, task);
        occupiedKeys.add(task.taskKey);
        occupiedNumbers.add(task.number);
      }

      if (!task.linksInitialized) {
        await this.initializeLinks(
          tx,
          task,
          legacy.relatedDocumentIds,
          createdById
        );
      }
    }
  }

  private mapTask(task: TaskWithLinks) {
    return {
      docId: task.docId,
      taskKey: task.taskKey,
      number: task.number,
      relatedDocumentIds: task.links.map(link => link.documentId).sort(),
      createdAt: task.createdAt,
    };
  }

  async sync(
    workspaceIdValue: string,
    prefixValue: string,
    tasks: TrackWorkLegacyTaskInput[],
    createdById: string
  ) {
    const workspaceId = this.validateIdentifier(
      workspaceIdValue,
      'workspace id'
    );
    const prefix = normalizeTaskKey(prefixValue);
    if (!TASK_PREFIX_RE.test(prefix)) {
      throw new BadRequestException('Invalid task key prefix');
    }
    const requestedDocIds = [
      ...new Set(
        tasks.map(task =>
          this.validateIdentifier(task.docId, 'task document id')
        )
      ),
    ];

    return this.prisma.$transaction(
      async tx => {
        await this.lockWorkspace(tx, workspaceId);
        await this.importLegacyTasks(tx, workspaceId, tasks, createdById);

        const registered = await tx.trackWorkTask.findMany({
          where: { workspaceId },
          select: { docId: true, number: true },
          orderBy: { number: 'desc' },
        });
        const registeredDocIds = new Set(registered.map(task => task.docId));
        let nextNumber = (registered[0]?.number ?? 0) + 1;
        const relatedDocumentsByDocId = new Map(
          tasks.map(task => [
            this.validateIdentifier(task.docId, 'task document id'),
            this.normalizeRelatedDocumentIds(
              task.docId,
              task.relatedDocumentIds
            ),
          ])
        );

        for (const docId of requestedDocIds.sort()) {
          if (registeredDocIds.has(docId)) {
            continue;
          }
          if (nextNumber > MAX_TASK_NUMBER) {
            throw new BadRequestException(
              'TrackWork task number range exhausted'
            );
          }
          await tx.trackWorkTask.create({
            data: {
              workspaceId,
              docId,
              number: nextNumber,
              taskKey: formatTaskKey(prefix, nextNumber),
              linksInitialized: true,
              createdById,
              links: {
                create: (relatedDocumentsByDocId.get(docId) ?? []).map(
                  documentId => ({
                    workspaceId,
                    documentId,
                    createdById,
                  })
                ),
              },
            },
          });
          nextNumber += 1;
        }

        const records = await tx.trackWorkTask.findMany({
          where: { workspaceId, docId: { in: requestedDocIds } },
          include: { links: true },
          orderBy: { number: 'asc' },
        });
        return records.map(task => this.mapTask(task));
      },
      { maxWait: 30000, timeout: 30000 }
    );
  }

  async allocate(input: AllocateTrackWorkTaskInput, createdById: string) {
    const workspaceId = this.validateIdentifier(
      input.workspaceId,
      'workspace id'
    );
    const docId = this.validateIdentifier(input.docId, 'task document id');
    const prefix = normalizeTaskKey(input.prefix);
    if (!TASK_PREFIX_RE.test(prefix)) {
      throw new BadRequestException('Invalid task key prefix');
    }
    const relatedDocumentIds = this.normalizeRelatedDocumentIds(
      docId,
      input.relatedDocumentIds
    );

    return this.prisma.$transaction(
      async tx => {
        await this.lockWorkspace(tx, workspaceId);
        await this.importLegacyTasks(
          tx,
          workspaceId,
          input.legacyTasks,
          createdById
        );

        let task = await tx.trackWorkTask.findUnique({
          where: { workspaceId_docId: { workspaceId, docId } },
          include: { links: true },
        });

        if (!task) {
          const latest = await tx.trackWorkTask.findFirst({
            where: { workspaceId },
            orderBy: { number: 'desc' },
            select: { number: true },
          });
          const number = (latest?.number ?? 0) + 1;
          if (number > MAX_TASK_NUMBER) {
            throw new BadRequestException(
              'TrackWork task number range exhausted'
            );
          }
          task = await tx.trackWorkTask.create({
            data: {
              workspaceId,
              docId,
              number,
              taskKey: formatTaskKey(prefix, number),
              linksInitialized: true,
              createdById,
              links: {
                create: relatedDocumentIds.map(documentId => ({
                  workspaceId,
                  documentId,
                  createdById,
                })),
              },
            },
            include: { links: true },
          });
        }

        return this.mapTask(task);
      },
      { maxWait: 30000, timeout: 30000 }
    );
  }

  async setDocumentLinks(
    workspaceIdValue: string,
    taskDocIdValue: string,
    documentIdsValue: string[],
    createdById: string
  ) {
    const workspaceId = this.validateIdentifier(
      workspaceIdValue,
      'workspace id'
    );
    const taskDocId = this.validateIdentifier(
      taskDocIdValue,
      'task document id'
    );
    const documentIds = this.normalizeRelatedDocumentIds(
      taskDocId,
      documentIdsValue
    );

    return this.prisma.$transaction(async tx => {
      await this.lockWorkspace(tx, workspaceId);
      const task = await tx.trackWorkTask.findUnique({
        where: { workspaceId_docId: { workspaceId, docId: taskDocId } },
      });
      if (!task) {
        throw new BadRequestException('TrackWork task is not registered');
      }

      await tx.trackWorkDocumentLink.deleteMany({
        where: { taskId: task.id, documentId: { notIn: documentIds } },
      });
      await tx.trackWorkDocumentLink.createMany({
        data: documentIds.map(documentId => ({
          workspaceId,
          taskId: task.id,
          documentId,
          createdById,
        })),
        skipDuplicates: true,
      });
      const updated = await tx.trackWorkTask.update({
        where: { id: task.id },
        data: { linksInitialized: true },
        include: { links: true },
      });
      return this.mapTask(updated);
    });
  }

  async getByKey(workspaceId: string, taskKey: string) {
    workspaceId = this.validateIdentifier(workspaceId, 'workspace id');
    taskKey = normalizeTaskKey(taskKey);
    if (!parseTaskKey(taskKey)) {
      return null;
    }
    const task = await this.prisma.trackWorkTask.findUnique({
      where: {
        workspaceId_taskKey: {
          workspaceId,
          taskKey,
        },
      },
      include: { links: true },
    });
    return task ? this.mapTask(task) : null;
  }

  async getDocumentBacklinks(workspaceId: string, documentId: string) {
    workspaceId = this.validateIdentifier(workspaceId, 'workspace id');
    documentId = this.validateIdentifier(documentId, 'document id');
    const links = await this.prisma.trackWorkDocumentLink.findMany({
      where: { workspaceId, documentId },
      include: { task: { include: { links: true } } },
      orderBy: { task: { number: 'asc' } },
    });
    return links.map(link => this.mapTask(link.task));
  }
}
