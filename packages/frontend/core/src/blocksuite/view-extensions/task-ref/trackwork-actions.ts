import { DocsService } from '@affine/core/modules/doc';
import { WorkspaceServerService } from '@affine/core/modules/cloud';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { WorkspacePropertyService } from '@affine/core/modules/workspace-property';
import {
  allocateTrackWorkTaskMutation,
  trackWorkTaskQuery,
} from '@affine/graphql';
import {
  formatTaskKey,
  normalizeTaskKey,
  parseTaskKey,
  parseTaskNumber,
} from '@affine/trackwork';
import type { FrameworkProvider } from '@toeverything/infra';
import { firstValueFrom } from 'rxjs';

import {
  DEFAULT_BOARD_ID,
  parseRelatedDocs,
  resolveTaskTrackerBoards,
  TASK_BOARD_PROPERTY,
  TASK_DESCRIPTION_PROPERTY,
  TASK_NUMBER_PROPERTY,
  TASK_RELATED_DOCS_PROPERTY,
  TASK_STATUS_PROPERTY,
  TASK_TRACKER_FLAG_PROPERTY,
  stringifyRelatedDocs,
} from '../../../desktop/pages/workspace/task-tracker/config';

export const resolveTaskDocIdByKey = async (
  framework: FrameworkProvider,
  key: string
): Promise<string | null> => {
  const docsService = framework.get(DocsService);
  const workspace = framework.get(WorkspaceService).workspace;
  const normalizedKey = normalizeTaskKey(key);
  const server = framework.get(WorkspaceServerService).server;

  if (workspace.flavour !== 'local' && server) {
    try {
      const result = await server.gql({
        query: trackWorkTaskQuery,
        variables: { workspaceId: workspace.id, taskKey: normalizedKey },
      });
      if (result.trackWorkTask) {
        return result.trackWorkTask.docId;
      }
    } catch {
      // The local document metadata remains a read-only compatibility path
      // while the registry is temporarily unavailable.
    }
  }

  const numbers = await firstValueFrom(
    docsService.propertyValues$(`custom:${TASK_NUMBER_PROPERTY}`)
  );
  const flags = await firstValueFrom(
    docsService.propertyValues$(`custom:${TASK_TRACKER_FLAG_PROPERTY}`)
  );

  const workspacePrefix = (workspace.taskKey$.value || 'TASK').toUpperCase();

  for (const [docId, value] of numbers) {
    const storedKey =
      value && parseTaskKey(value)
        ? normalizeTaskKey(value)
        : formatTaskKey(workspacePrefix, parseTaskNumber(value));
    if (
      flags.get(docId) === 'true' &&
      parseTaskKey(storedKey) &&
      storedKey === normalizedKey
    ) {
      return docId;
    }
  }

  return null;
};

export const createTaskFromText = async (
  framework: FrameworkProvider,
  text: string,
  sourceDocId?: string
): Promise<string | null> => {
  const workspacePropertyService = framework.get(WorkspacePropertyService);
  const docsService = framework.get(DocsService);
  const workspace = framework.get(WorkspaceService).workspace;
  const server = framework.get(WorkspaceServerService).server;
  if (workspace.flavour === 'local' || !server) {
    return null;
  }

  const existingNumbers = await firstValueFrom(
    docsService.propertyValues$(`custom:${TASK_NUMBER_PROPERTY}`)
  );
  const trackerFlags = await firstValueFrom(
    docsService.propertyValues$(`custom:${TASK_TRACKER_FLAG_PROPERTY}`)
  );
  const relatedDocuments = await firstValueFrom(
    docsService.propertyValues$(`custom:${TASK_RELATED_DOCS_PROPERTY}`)
  );
  const workspacePrefix = (workspace.taskKey$.value || 'TASK').toUpperCase();

  const statusPropertyInfo =
    workspacePropertyService.propertyInfo$(TASK_STATUS_PROPERTY).value;
  const boards = resolveTaskTrackerBoards(
    statusPropertyInfo?.additionalData as never
  );
  const board = boards.find(item => item.id === DEFAULT_BOARD_ID) ?? boards[0];

  if (!board) {
    return null;
  }

  const doc = docsService.createDoc({ primaryMode: 'page' });
  const sourceDocumentIds =
    sourceDocId && sourceDocId !== doc.id ? [sourceDocId] : [];

  let taskKey: string;
  try {
    const result = await server.gql({
      query: allocateTrackWorkTaskMutation,
      variables: {
        input: {
          workspaceId: workspace.id,
          docId: doc.id,
          prefix: workspacePrefix,
          relatedDocumentIds: sourceDocumentIds,
          legacyTasks: [...trackerFlags.entries()]
            .filter(([, enabled]) => enabled === 'true')
            .map(([docId]) => {
              const stored = existingNumbers.get(docId);
              const legacyTaskKey =
                stored && parseTaskKey(stored)
                  ? normalizeTaskKey(stored)
                  : parseTaskNumber(stored) > 0
                    ? formatTaskKey(workspacePrefix, parseTaskNumber(stored))
                    : '';
              return {
                docId,
                taskKey: legacyTaskKey,
                relatedDocumentIds: parseRelatedDocs(
                  relatedDocuments.get(docId)
                ),
              };
            }),
        },
      },
    });
    taskKey = result.allocateTrackWorkTask.taskKey;
  } catch {
    doc.moveToTrash();
    return null;
  }

  doc.setCustomProperty(TASK_TRACKER_FLAG_PROPERTY, 'true');
  doc.setCustomProperty(TASK_BOARD_PROPERTY, board.id);
  doc.setCustomProperty(TASK_STATUS_PROPERTY, board.flow[0]?.id ?? '');
  doc.setCustomProperty(TASK_DESCRIPTION_PROPERTY, text.trim().slice(0, 4000));
  doc.setCustomProperty(TASK_NUMBER_PROPERTY, taskKey);
  if (sourceDocumentIds.length > 0) {
    doc.setCustomProperty(
      TASK_RELATED_DOCS_PROPERTY,
      stringifyRelatedDocs(sourceDocumentIds)
    );
  }

  const firstLine = text.trim().split('\n')[0]?.slice(0, 80) ?? '';
  if (firstLine) {
    await docsService.changeDocTitle(doc.id, firstLine);
  }

  return doc.id;
};
