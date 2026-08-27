import { DocsService } from '@affine/core/modules/doc';
import { WorkspacePropertyService } from '@affine/core/modules/workspace-property';
import { parseTaskNumber } from '@affine/trackwork';
import type { FrameworkProvider } from '@toeverything/infra';
import { firstValueFrom } from 'rxjs';

import {
  DEFAULT_BOARD_ID,
  resolveTaskTrackerBoards,
  TASK_BOARD_PROPERTY,
  TASK_DESCRIPTION_PROPERTY,
  TASK_NUMBER_PROPERTY,
  TASK_STATUS_PROPERTY,
  TASK_TRACKER_FLAG_PROPERTY,
} from '../../../desktop/pages/workspace/task-tracker/config';

export const resolveTaskDocIdByKey = async (
  framework: FrameworkProvider,
  key: string
): Promise<string | null> => {
  const docsService = framework.get(DocsService);
  const numbers = await firstValueFrom(
    docsService.propertyValues$(`custom:${TASK_NUMBER_PROPERTY}`)
  );
  const flags = await firstValueFrom(
    docsService.propertyValues$(`custom:${TASK_TRACKER_FLAG_PROPERTY}`)
  );

  const number = parseTaskNumber(key.split('-').at(-1));

  for (const [docId, value] of numbers) {
    if (
      flags.get(docId) === 'true' &&
      value &&
      parseTaskNumber(value) === number
    ) {
      return docId;
    }
  }

  return null;
};

export const createTaskFromText = async (
  framework: FrameworkProvider,
  text: string
): Promise<string | null> => {
  const workspacePropertyService = framework.get(WorkspacePropertyService);
  const docsService = framework.get(DocsService);

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

  doc.setCustomProperty(TASK_TRACKER_FLAG_PROPERTY, 'true');
  doc.setCustomProperty(TASK_BOARD_PROPERTY, board.id);
  doc.setCustomProperty(TASK_STATUS_PROPERTY, board.flow[0]?.id ?? '');
  doc.setCustomProperty(TASK_DESCRIPTION_PROPERTY, text.trim().slice(0, 4000));

  const firstLine = text.trim().split('\n')[0]?.slice(0, 80) ?? '';
  if (firstLine) {
    await docsService.changeDocTitle(doc.id, firstLine);
  }

  return doc.id;
};
