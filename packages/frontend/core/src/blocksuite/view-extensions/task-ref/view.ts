import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import type { FrameworkProvider } from '@toeverything/infra';

import { TaskRefMarkdownExtension } from './inline-markdown';
import { TaskRefInlineSpecExtension } from './inline-spec';
import { taskRefSlashMenuExtension } from './slash-menu';
import { TaskRefConfigExtension } from './task-ref-config';

export class TaskRefViewExtension extends ViewExtensionProvider<{
  framework?: FrameworkProvider;
}> {
  override name = 'affine-task-ref';

  override setup(
    context: ViewExtensionContext,
    options?: { framework?: FrameworkProvider }
  ) {
    super.setup(context, options);

    if (options?.framework) {
      context.register(
        TaskRefConfigExtension({ framework: options.framework })
      );
      context.register(taskRefSlashMenuExtension(options.framework));
    }

    context.register(TaskRefInlineSpecExtension);
    context.register(TaskRefMarkdownExtension);
  }
}
