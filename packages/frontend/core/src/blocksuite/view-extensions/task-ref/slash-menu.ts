import type { ExtensionType } from '@blocksuite/affine/store';
import {
  getSelectedModelsCommand,
  getTextSelectionCommand,
} from '@blocksuite/affine-shared/commands';
import {
  SlashMenuConfigIdentifier,
  type SlashMenuItem,
} from '@blocksuite/affine-widget-slash-menu';
import { CheckBoxCheckLinearIcon } from '@blocksuite/icons/lit';
import { TextSelection } from '@blocksuite/std';
import type { FrameworkProvider } from '@toeverything/infra';

export function taskRefSlashMenuExtension(
  framework: FrameworkProvider
): ExtensionType {
  return {
    setup: di => {
      const identifier = SlashMenuConfigIdentifier('affine:note');
      const prev = di.getFactory(identifier);
      if (!prev) {
        return;
      }

      di.override(identifier, provider => {
        const prevConfig = prev(provider);

        const item: SlashMenuItem = {
          name: 'Create TrackWork task',
          icon: CheckBoxCheckLinearIcon(),
          group: '1_List@99',
          searchAlias: ['trackwork', 'task', 'issue'],
          when: ({ std }) => !!std.selection.some(TextSelection),
          action: ({ std }) => {
            const [success, result] = std.command.exec(getTextSelectionCommand);
            if (!success || !result?.currentTextSelection) {
              return;
            }

            const [modelsSuccess, modelsResult] = std.command.exec(
              getSelectedModelsCommand,
              { types: ['text'] }
            );
            if (!modelsSuccess) {
              return;
            }

            const selectedModels = (modelsResult.selectedModels ??
              []) as Array<{
              text?: { toString(): string };
            }>;

            const text = selectedModels
              .map(model => model.text?.toString() ?? '')
              .join('\n');

            if (!text.trim()) {
              return;
            }

            void import('./trackwork-actions')
              .then(({ createTaskFromText }) =>
                createTaskFromText(framework, text)
              )
              .then(docId => {
                if (!docId) {
                  return;
                }
                return import('@affine/core/modules/workbench').then(
                  ({ WorkbenchService }) => {
                    framework.get(WorkbenchService).workbench.openDoc(docId);
                  }
                );
              });
          },
        };

        if (typeof prevConfig.items === 'function') {
          const generator = prevConfig.items;
          prevConfig.items = (ctx: Parameters<typeof generator>[0]) => [
            ...generator(ctx),
            item,
          ];
        } else {
          prevConfig.items = [...prevConfig.items, item];
        }

        return prevConfig;
      });
    },
  };
}
