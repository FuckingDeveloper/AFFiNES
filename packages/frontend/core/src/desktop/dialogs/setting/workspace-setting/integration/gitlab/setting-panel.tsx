import { Button, notify, useConfirmModal } from '@affine/component';
import { useMutation } from '@affine/core/components/hooks/use-mutation';
import { useQuery } from '@affine/core/components/hooks/use-query';
import { WorkspaceService } from '@affine/core/modules/workspace';
import {
  createDevelopmentIntegrationMutation,
  deleteDevelopmentIntegrationMutation,
  developmentIntegrationsQuery,
  developmentRepositoriesMutation,
  importDevelopmentRepositoryMutation,
  rotateDevelopmentIntegrationCredentialsMutation,
  setDevelopmentRepositoryEnabledMutation,
  testDevelopmentIntegrationMutation,
  updateDevelopmentIntegrationMutation,
} from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { GithubIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import { IntegrationSettingHeader } from '../setting';
import * as styles from './setting-panel.css';

export const GitLabSettingPanel = () => {
  const t = useI18n();
  const workspaceService = useService(WorkspaceService);
  const workspaceId = workspaceService.workspace.id;
  const { openConfirmModal } = useConfirmModal();

  const { data, mutate: revalidate } = useQuery({
    query: developmentIntegrationsQuery,
    variables: { workspaceId },
  });

  const { trigger: createTrigger } = useMutation({
    mutation: createDevelopmentIntegrationMutation,
  });
  const { trigger: updateTrigger } = useMutation({
    mutation: updateDevelopmentIntegrationMutation,
  });
  const { trigger: rotateTrigger } = useMutation({
    mutation: rotateDevelopmentIntegrationCredentialsMutation,
  });
  const { trigger: deleteTrigger } = useMutation({
    mutation: deleteDevelopmentIntegrationMutation,
  });
  const { trigger: testTrigger } = useMutation({
    mutation: testDevelopmentIntegrationMutation,
  });
  const { trigger: repositoriesTrigger } = useMutation({
    mutation: developmentRepositoriesMutation,
  });
  const { trigger: importTrigger } = useMutation({
    mutation: importDevelopmentRepositoryMutation,
  });
  const { trigger: enableTrigger } = useMutation({
    mutation: setDevelopmentRepositoryEnabledMutation,
  });

  const connection = data?.workspace?.developmentIntegrations?.find(
    item => item.provider === 'gitlab'
  );

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://gitlab.com');
  const [token, setToken] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [newToken, setNewToken] = useState('');
  const [newWebhookSecret, setNewWebhookSecret] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testOk, setTestOk] = useState(false);
  const [repositories, setRepositories] = useState<
    Array<{
      externalId: string;
      name: string;
      fullName: string;
      webUrl: string;
      defaultBranch?: string | null;
      imported: boolean;
      enabled: boolean;
    }>
  >([]);
  const [repositoriesLoaded, setRepositoriesLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const connectionId = connection?.id;

  useEffect(() => {
    if (connection) {
      setName(connection.name);
      setBaseUrl(connection.baseUrl);
    }
  }, [connection]);

  const handleCreate = useCallback(async () => {
    setBusy('create');
    try {
      await createTrigger({
        input: {
          workspaceId,
          provider: 'gitlab',
          name: name.trim() || 'GitLab',
          baseUrl: baseUrl.trim(),
          token,
          webhookSecret: webhookSecret || undefined,
        },
      });
      notify.success({
        title: t['com.affine.integration.gitlab.connection.created'](),
      });
      setToken('');
      setWebhookSecret('');
      await revalidate();
    } catch {
      notify.error({
        title: t['com.affine.integration.gitlab.connection.create-failed'](),
      });
    } finally {
      setBusy(null);
    }
  }, [
    baseUrl,
    createTrigger,
    name,
    revalidate,
    t,
    token,
    webhookSecret,
    workspaceId,
  ]);

  const handleTest = useCallback(async () => {
    if (!connectionId) {
      return;
    }
    setBusy('test');
    try {
      const result = await testTrigger({ connectionId });
      setTestOk(result.testDevelopmentIntegration.ok);
      setTestResult(result.testDevelopmentIntegration.message ?? null);
    } catch {
      setTestOk(false);
      setTestResult(
        t['com.affine.integration.gitlab.connection.test-failed']()
      );
    } finally {
      setBusy(null);
    }
  }, [connectionId, t, testTrigger]);

  const handleToggleEnabled = useCallback(
    async (enabled: boolean) => {
      if (!connectionId) {
        return;
      }
      setBusy('toggle');
      try {
        await updateTrigger({
          input: { id: connectionId, enabled },
        });
        await revalidate();
      } catch {
        notify.error({
          title: t['com.affine.integration.gitlab.connection.update-failed'](),
        });
      } finally {
        setBusy(null);
      }
    },
    [connectionId, revalidate, t, updateTrigger]
  );

  const handleSaveConnection = useCallback(async () => {
    if (!connectionId || !name.trim()) {
      return;
    }
    setBusy('save');
    try {
      await updateTrigger({
        input: {
          id: connectionId,
          name: name.trim(),
          baseUrl: baseUrl.trim(),
        },
      });
      notify.success({
        title: t['com.affine.integration.gitlab.connection.updated'](),
      });
      await revalidate();
    } catch {
      notify.error({
        title: t['com.affine.integration.gitlab.connection.update-failed'](),
      });
    } finally {
      setBusy(null);
    }
  }, [baseUrl, connectionId, name, revalidate, t, updateTrigger]);

  const handleRotate = useCallback(async () => {
    if (!connectionId) {
      return;
    }
    setBusy('rotate');
    try {
      await rotateTrigger({
        input: {
          id: connectionId,
          token: newToken || undefined,
          webhookSecret: newWebhookSecret || undefined,
        },
      });
      notify.success({
        title: t['com.affine.integration.gitlab.connection.rotated'](),
      });
      setNewToken('');
      setNewWebhookSecret('');
      await revalidate();
    } catch {
      notify.error({
        title: t['com.affine.integration.gitlab.connection.update-failed'](),
      });
    } finally {
      setBusy(null);
    }
  }, [connectionId, newToken, newWebhookSecret, revalidate, rotateTrigger, t]);

  const handleDelete = useCallback(async () => {
    if (!connectionId) {
      return;
    }
    setBusy('delete');
    try {
      await deleteTrigger({ connectionId });
      notify.success({
        title: t['com.affine.integration.gitlab.connection.deleted'](),
      });
      setRepositories([]);
      setRepositoriesLoaded(false);
      await revalidate();
    } catch {
      notify.error({
        title: t['com.affine.integration.gitlab.connection.delete-failed'](),
      });
    } finally {
      setBusy(null);
    }
  }, [connectionId, deleteTrigger, revalidate, t]);

  const handleLoadRepositories = useCallback(async () => {
    if (!connectionId) {
      return;
    }
    setBusy('repos');
    try {
      const result = await repositoriesTrigger({ connectionId });
      setRepositories(result.developmentRepositories);
      setRepositoriesLoaded(true);
    } catch {
      notify.error({
        title: t['com.affine.integration.gitlab.repositories.load-failed'](),
      });
    } finally {
      setBusy(null);
    }
  }, [connectionId, repositoriesTrigger, t]);

  const handleImportRepository = useCallback(
    async (repository: {
      externalId: string;
      name: string;
      fullName: string;
      webUrl: string;
      defaultBranch?: string | null;
    }) => {
      if (!connectionId) {
        return;
      }
      try {
        await importTrigger({
          input: {
            connectionId,
            externalId: repository.externalId,
            name: repository.name,
            fullName: repository.fullName,
            webUrl: repository.webUrl,
            defaultBranch: repository.defaultBranch ?? undefined,
          },
        });
        setRepositories(prev =>
          prev.map(item =>
            item.externalId === repository.externalId
              ? { ...item, imported: true, enabled: true }
              : item
          )
        );
      } catch {
        notify.error({
          title: t['com.affine.integration.gitlab.repositories.load-failed'](),
        });
      }
    },
    [connectionId, importTrigger, t]
  );

  const handleToggleRepository = useCallback(
    async (externalId: string, enabled: boolean) => {
      if (!connectionId) {
        return;
      }
      const repository = repositories.find(
        item => item.externalId === externalId
      );
      if (!repository) {
        return;
      }
      setRepositories(prev =>
        prev.map(item =>
          item.externalId === externalId ? { ...item, enabled } : item
        )
      );
      try {
        const imported = await importTrigger({
          input: {
            connectionId,
            externalId: repository.externalId,
            name: repository.name,
            fullName: repository.fullName,
            webUrl: repository.webUrl,
            defaultBranch: repository.defaultBranch,
          },
        });
        await enableTrigger({
          repositoryId: imported.importDevelopmentRepository.id,
          enabled,
        });
      } catch {
        setRepositories(prev =>
          prev.map(item =>
            item.externalId === externalId
              ? { ...item, enabled: !enabled }
              : item
          )
        );
        notify.error({
          title:
            t['com.affine.integration.gitlab.repositories.update-failed'](),
        });
      }
    },
    [connectionId, enableTrigger, importTrigger, repositories, t]
  );

  const handleCopyWebhookUrl = useCallback(async () => {
    if (!connection?.webhookUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(connection.webhookUrl);
      notify.success({
        title: t['com.affine.integration.gitlab.connection.copied'](),
      });
    } catch {
      notify.error({
        title: t['com.affine.integration.gitlab.connection.copy-failed'](),
      });
    }
  }, [connection?.webhookUrl, t]);

  return (
    <>
      <IntegrationSettingHeader
        icon={<GithubIcon />}
        name={t['com.affine.integration.gitlab.name']()}
        desc={t['com.affine.integration.gitlab.desc']()}
      />

      {!connection ? (
        <div className={styles.form}>
          <label className={styles.label}>
            {t['com.affine.integration.gitlab.connection.name']()}
            <input
              className={styles.input}
              value={name}
              onChange={event => {
                setName(event.target.value);
              }}
            />
          </label>
          <label className={styles.label}>
            {t['com.affine.integration.gitlab.connection.base-url']()}
            <input
              className={styles.input}
              value={baseUrl}
              onChange={event => {
                setBaseUrl(event.target.value);
              }}
            />
          </label>
          <label className={styles.label}>
            {t['com.affine.integration.gitlab.connection.token']()}
            <input
              className={styles.input}
              type="password"
              value={token}
              onChange={event => {
                setToken(event.target.value);
              }}
            />
          </label>
          <label className={styles.label}>
            {t['com.affine.integration.gitlab.connection.webhook-secret']()}
            <input
              className={styles.input}
              type="password"
              value={webhookSecret}
              onChange={event => {
                setWebhookSecret(event.target.value);
              }}
            />
          </label>
          <Button
            onClick={() => void handleCreate()}
            disabled={
              busy !== null || !baseUrl.trim() || !token || !webhookSecret
            }
          >
            {t['com.affine.integration.gitlab.connection.create']()}
          </Button>
        </div>
      ) : (
        <div className={styles.form}>
          <div className={styles.formGrid}>
            <label className={styles.label}>
              {t['com.affine.integration.gitlab.connection.name']()}
              <input
                className={styles.input}
                value={name}
                onChange={event => {
                  setName(event.target.value);
                }}
              />
            </label>
            <label className={styles.label}>
              {t['com.affine.integration.gitlab.connection.base-url']()}
              <input
                className={styles.input}
                value={baseUrl}
                onChange={event => {
                  setBaseUrl(event.target.value);
                }}
              />
            </label>
          </div>
          <div className={styles.row}>
            <Button
              onClick={() => void handleSaveConnection()}
              disabled={
                busy !== null ||
                !name.trim() ||
                !baseUrl.trim() ||
                (name.trim() === connection.name &&
                  baseUrl.trim() === connection.baseUrl)
              }
            >
              {t['Save']()}
            </Button>
            <label className={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={connection.enabled}
                onChange={event => {
                  handleToggleEnabled(event.target.checked).catch(() => {});
                }}
              />
              {t['com.affine.integration.gitlab.connection.enabled']()}
            </label>
          </div>
          <div className={styles.row}>
            <span className={styles.muted}>
              {connection.hasToken
                ? t['com.affine.integration.gitlab.connection.token-masked']()
                : ''}
              {' • '}
              {connection.hasWebhookSecret
                ? t['com.affine.integration.gitlab.connection.secret-masked']()
                : t['com.affine.integration.gitlab.connection.no-secret']()}
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.value}>{connection.webhookUrl}</span>
            <Button onClick={() => void handleCopyWebhookUrl()}>
              {t['com.affine.integration.gitlab.connection.copy']()}
            </Button>
          </div>

          <div className={styles.row}>
            <Button onClick={() => void handleTest()} disabled={busy !== null}>
              {t['com.affine.integration.gitlab.connection.test']()}
            </Button>
            {testResult ? (
              <span className={testOk ? styles.ok : styles.error}>
                {testResult}
              </span>
            ) : null}
          </div>

          <div className={styles.separator} />

          <label className={styles.label}>
            {t['com.affine.integration.gitlab.connection.token']()}
            <input
              className={styles.input}
              type="password"
              value={newToken}
              onChange={event => {
                setNewToken(event.target.value);
              }}
            />
          </label>
          <label className={styles.label}>
            {t['com.affine.integration.gitlab.connection.webhook-secret']()}
            <input
              className={styles.input}
              type="password"
              value={newWebhookSecret}
              onChange={event => {
                setNewWebhookSecret(event.target.value);
              }}
            />
          </label>
          <Button
            onClick={() => void handleRotate()}
            disabled={busy !== null || (!newToken && !newWebhookSecret)}
          >
            {t['com.affine.integration.gitlab.connection.rotate']()}
          </Button>

          <div className={styles.separator} />

          <div className={styles.row}>
            <Button
              onClick={() => void handleLoadRepositories()}
              disabled={busy !== null}
            >
              {t['com.affine.integration.gitlab.repositories.load']()}
            </Button>
          </div>
          {repositories.length > 0 ? (
            <div className={styles.repositoryList}>
              {repositories.map(repository => (
                <div key={repository.externalId} className={styles.row}>
                  <span className={styles.value}>{repository.fullName}</span>
                  {repository.imported ? (
                    <label className={styles.toggleLabel}>
                      <input
                        type="checkbox"
                        checked={repository.enabled}
                        onChange={event => {
                          handleToggleRepository(
                            repository.externalId,
                            event.target.checked
                          ).catch(() => {});
                        }}
                      />
                      {t[
                        'com.affine.integration.gitlab.repositories.enabled'
                      ]()}
                    </label>
                  ) : (
                    <Button
                      onClick={() => {
                        handleImportRepository(repository).catch(() => {});
                      }}
                    >
                      {t['com.affine.integration.gitlab.repositories.import']()}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : repositoriesLoaded ? (
            <div className={styles.muted}>
              {t['com.affine.integration.gitlab.repositories.empty']()}
            </div>
          ) : null}

          <div className={styles.separator} />

          <Button
            onClick={() => {
              openConfirmModal({
                title:
                  t[
                    'com.affine.integration.gitlab.connection.delete-confirm-title'
                  ](),
                description:
                  t[
                    'com.affine.integration.gitlab.connection.delete-confirm-description'
                  ](),
                confirmText: t['Delete'](),
                cancelText: t['Cancel'](),
                confirmButtonOptions: { variant: 'error' },
                onConfirm: () => void handleDelete(),
              });
            }}
            disabled={busy !== null}
          >
            {t['com.affine.integration.gitlab.connection.delete']()}
          </Button>
        </div>
      )}
    </>
  );
};
