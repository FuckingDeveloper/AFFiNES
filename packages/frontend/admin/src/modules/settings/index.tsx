import { Button } from '@affine/admin/components/ui/button';
import { ScrollArea } from '@affine/admin/components/ui/scroll-area';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@affine/admin/components/ui/tabs';
import { get } from 'lodash-es';
import { useCallback, useState } from 'react';

import { useI18n } from '../../i18n';
import { Header } from '../header';
import {
  ALL_CONFIG_DESCRIPTORS,
  ALL_SETTING_GROUPS,
  type AppConfig,
} from './config';
import { type ConfigInputProps, ConfigRow } from './config-input-row';
import { useAppConfig } from './use-app-config';

export function SettingsPage() {
  const {
    appConfig,
    update,
    saveGroup,
    resetGroup,
    patchedAppConfig,
    isGroupDirty,
    isGroupSaving,
    getGroupVersion,
  } = useAppConfig();
  const { t } = useI18n();

  return (
    <div className="flex h-dvh flex-1 flex-col bg-background">
      <Header title={t('settings.title')} />
      <AdminPanel
        onUpdate={update}
        appConfig={appConfig}
        patchedAppConfig={patchedAppConfig}
        onSaveGroup={saveGroup}
        onResetGroup={resetGroup}
        isGroupDirty={isGroupDirty}
        isGroupSaving={isGroupSaving}
        getGroupVersion={getGroupVersion}
      />
    </div>
  );
}

const AdminPanel = ({
  appConfig,
  patchedAppConfig,
  onUpdate,
  onSaveGroup,
  onResetGroup,
  isGroupDirty,
  isGroupSaving,
  getGroupVersion,
}: {
  appConfig: AppConfig;
  patchedAppConfig: AppConfig;
  onUpdate: (path: string, value: any) => void;
  onSaveGroup: (module: string) => Promise<void>;
  onResetGroup: (module: string) => void;
  isGroupDirty: (module: string) => boolean;
  isGroupSaving: (module: string) => boolean;
  getGroupVersion: (module: string) => number;
}) => {
  const { t } = useI18n();
  const [groupErrors, setGroupErrors] = useState<
    Record<string, Record<string, string>>
  >({});
  const [activeModule, setActiveModule] = useState(
    ALL_SETTING_GROUPS[0]?.module ?? ''
  );

  const onFieldErrorChange = useCallback((field: string, error?: string) => {
    const [module] = field.split('/');
    if (!module) {
      return;
    }

    setGroupErrors(prev => {
      const moduleErrors = prev[module] ?? {};

      if (error) {
        if (moduleErrors[field] === error) {
          return prev;
        }
        return {
          ...prev,
          [module]: {
            ...moduleErrors,
            [field]: error,
          },
        };
      }

      if (!(field in moduleErrors)) {
        return prev;
      }

      const nextModuleErrors = { ...moduleErrors };
      delete nextModuleErrors[field];

      if (Object.keys(nextModuleErrors).length === 0) {
        const next = { ...prev };
        delete next[module];
        return next;
      }

      return {
        ...prev,
        [module]: nextModuleErrors,
      };
    });
  }, []);

  const clearModuleErrors = useCallback((module: string) => {
    setGroupErrors(prev => {
      if (!prev[module]) {
        return prev;
      }

      const next = { ...prev };
      delete next[module];
      return next;
    });
  }, []);

  const getGroupLabel = (module: string, name: string): string => {
    const key = `groups.${module}`;
    const translated = t(key);
    if (translated !== key) return translated;
    return name;
  };

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto w-full max-w-[1120px] px-6 py-5">
        <Tabs
          value={activeModule}
          onValueChange={setActiveModule}
          orientation="vertical"
          className="flex flex-col gap-5 md:flex-row md:items-start"
        >
          <TabsList className="sticky top-5 z-10 h-auto w-full shrink-0 justify-start overflow-x-auto rounded-xl border border-border/60 bg-card p-2 shadow-1 md:w-56 md:flex-col md:overflow-visible">
            {ALL_SETTING_GROUPS.map(group => {
              const dirty = isGroupDirty(group.module);
              const hasValidationError = Boolean(
                groupErrors[group.module] &&
                Object.keys(groupErrors[group.module] ?? {}).length > 0
              );

              return (
                <TabsTrigger
                  key={group.module}
                  value={group.module}
                  className="h-10 w-auto min-w-max justify-start gap-2 px-3 text-left data-[state=active]:bg-primary data-[state=active]:text-primary-foreground md:w-full"
                >
                  <span className="truncate">
                    {getGroupLabel(group.module, group.name)}
                  </span>
                  {hasValidationError ? (
                    <span className="ml-auto h-2 w-2 rounded-full bg-destructive" />
                  ) : dirty ? (
                    <span className="ml-auto h-2 w-2 rounded-full bg-orange-500" />
                  ) : null}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <div className="min-w-0 flex-1">
            {ALL_SETTING_GROUPS.map(group => {
              const { name, module, fields, operations } = group;
              const dirty = isGroupDirty(module);
              const saving = isGroupSaving(module);
              const sourceConfig =
                patchedAppConfig[module] ?? appConfig[module];
              const version = getGroupVersion(module);
              const hasValidationError = Boolean(
                groupErrors[module] &&
                Object.keys(groupErrors[module] ?? {}).length > 0
              );
              const groupLabel = getGroupLabel(module, name);

              return (
                <TabsContent
                  key={module}
                  value={module}
                  id={`config-module-${module}`}
                  className="mt-0 rounded-xl border border-border/60 bg-card p-5 shadow-1"
                >
                  <div className="mb-6 flex flex-col gap-1">
                    <h2 className="text-lg font-semibold">{groupLabel}</h2>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.manageGroup', {
                        group: groupLabel.toLowerCase(),
                      })}
                    </p>
                  </div>

                  <div
                    className="flex flex-col gap-8"
                    key={`${module}-${version}`}
                  >
                    {fields.map(field => {
                      let props: ConfigInputProps;
                      if (typeof field === 'string') {
                        const descriptor =
                          ALL_CONFIG_DESCRIPTORS[module][field];
                        const fieldKey = `${module}.${field}`;
                        const translatedDesc = t(`fields.${fieldKey}.desc`);
                        props = {
                          field: `${module}/${field}`,
                          desc:
                            translatedDesc !== `fields.${fieldKey}.desc`
                              ? translatedDesc
                              : (descriptor?.desc ?? field),
                          type: descriptor?.type ?? 'String',
                          options: [],
                          defaultValue: get(sourceConfig, field),
                          onChange: onUpdate,
                          example: t(`fields.${fieldKey}.example`),
                        };
                      } else {
                        const descriptor =
                          ALL_CONFIG_DESCRIPTORS[module][field.key];
                        const fieldKey = `${module}.${field.key}${field.sub ? `.${field.sub}` : ''}`;
                        const translatedDesc = t(`fields.${fieldKey}.desc`);
                        props = {
                          field: `${module}/${field.key}${field.sub ? `/${field.sub}` : ''}`,
                          desc:
                            field.desc ??
                            (translatedDesc !== `fields.${fieldKey}.desc`
                              ? translatedDesc
                              : (descriptor?.desc ?? field.key)),
                          type: field.type ?? descriptor?.type ?? 'String',
                          sensitive: field.sensitive,
                          // @ts-expect-error for enum type
                          options: field.options,
                          defaultValue: get(
                            sourceConfig,
                            field.key + (field.sub ? '.' + field.sub : '')
                          ),
                          onChange: onUpdate,
                          example: t(`fields.${fieldKey}.example`),
                        };
                      }

                      return (
                        <ConfigRow
                          key={props.field}
                          {...props}
                          onErrorChange={onFieldErrorChange}
                        />
                      );
                    })}

                    {operations?.map(Operation => (
                      <Operation
                        key={Operation.name}
                        appConfig={patchedAppConfig}
                      />
                    ))}

                    <div className="flex justify-end gap-2">
                      {dirty ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9 min-w-[88px]"
                          onClick={() => {
                            onResetGroup(module);
                            clearModuleErrors(module);
                          }}
                          disabled={saving}
                        >
                          {t('settings.cancel')}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        className="h-9 min-w-[88px]"
                        onClick={() => {
                          onSaveGroup(module).catch(err => {
                            console.error(err);
                          });
                        }}
                        disabled={!dirty || saving || hasValidationError}
                      >
                        {saving ? t('settings.saving') : t('settings.save')}
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              );
            })}
          </div>
        </Tabs>
      </div>
    </ScrollArea>
  );
};
