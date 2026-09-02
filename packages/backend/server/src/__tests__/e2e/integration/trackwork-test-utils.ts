import { PrismaClient } from '@prisma/client';

import { parseTaskKey } from '@affine/trackwork';
import { app } from '../test';

export const registerTrackWorkTaskKeys = async (
  workspaceId: string,
  taskKeys: string[]
) => {
  const db = app.get(PrismaClient);
  await db.trackWorkTask.createMany({
    data: taskKeys.map(taskKey => {
      const parsed = parseTaskKey(taskKey);
      if (!parsed) {
        throw new Error(`Invalid test task key: ${taskKey}`);
      }
      return {
        workspaceId,
        docId: `test-task-${taskKey.toLowerCase()}`,
        taskKey,
        number: parsed.number,
        linksInitialized: true,
      };
    }),
    skipDuplicates: true,
  });
};
