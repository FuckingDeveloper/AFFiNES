import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { InlineMarkdownExtension } from '@blocksuite/std/inline';

export type TaskRefTextAttributes = AffineTextAttributes & {
  taskRef?: string | null;
};

const TASK_KEY_PATTERN = /(^|[\s(])([A-Z]{4}-\d+)\s$/;

export const TaskRefMarkdownExtension =
  InlineMarkdownExtension<TaskRefTextAttributes>({
    name: 'task-ref',
    pattern: TASK_KEY_PATTERN,
    action: ({ inlineEditor, prefixText, inlineRange }) => {
      const match = prefixText.match(TASK_KEY_PATTERN);
      if (!match) {
        return;
      }

      const key = match[2];
      if (!key) {
        return;
      }

      const startIndex = inlineRange.index - key.length - 1;
      if (startIndex < 0) {
        return;
      }

      inlineEditor.formatText(
        { index: startIndex, length: key.length },
        { taskRef: key }
      );
    },
  });
