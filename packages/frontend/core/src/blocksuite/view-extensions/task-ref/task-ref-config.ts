import { ConfigExtensionFactory } from '@blocksuite/std';
import type { FrameworkProvider } from '@toeverything/infra';

export type TaskRefConfig = {
  framework?: FrameworkProvider;
};

export const TaskRefConfigExtension = ConfigExtensionFactory<TaskRefConfig>(
  'affine-view-task-ref-config'
);
