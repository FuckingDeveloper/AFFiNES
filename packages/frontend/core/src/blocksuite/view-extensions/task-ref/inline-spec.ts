import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { InlineSpecExtension } from '@blocksuite/std/inline';
import type { FrameworkProvider } from '@toeverything/infra';
import { html } from 'lit';
import { z } from 'zod';

import { TaskRefConfigExtension } from './task-ref-config';

export type TaskRefTextAttributes = AffineTextAttributes & {
  taskRef?: string | null;
};

export const TaskRefInlineSpecExtension =
  InlineSpecExtension<TaskRefTextAttributes>('task-ref', provider => {
    const framework = provider.getOptional(
      TaskRefConfigExtension.identifier
    )?.framework;

    return {
      name: 'task-ref',
      schema: z.object({
        taskRef: z.string().optional().nullable().catch(undefined),
      }),
      match: delta => !!delta.attributes?.taskRef,
      renderer: ({ delta }) => {
        return html`<affine-task-ref
          .key=${delta.attributes?.taskRef}
          .onClickHandler=${() => {
            void openTaskRef(framework, delta.attributes?.taskRef ?? undefined);
          }}
        ></affine-task-ref>`;
      },
    };
  });

async function openTaskRef(
  framework: FrameworkProvider | undefined,
  key: string | undefined
) {
  if (!framework || !key) {
    return;
  }

  const { resolveTaskDocIdByKey } = await import('./trackwork-actions');

  const docId = await resolveTaskDocIdByKey(framework, key);
  if (!docId) {
    return;
  }

  const { WorkbenchService } = await import('@affine/core/modules/workbench');
  framework.get(WorkbenchService).workbench.openDoc(docId);
}
