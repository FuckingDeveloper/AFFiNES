import { Button, notify, useConfirmModal } from '@affine/component';
import { useMutation } from '@affine/core/components/hooks/use-mutation';
import { useQuery } from '@affine/core/components/hooks/use-query';
import { WorkspaceService } from '@affine/core/modules/workspace';
import {
  createDevelopmentIntegrationMutation,
  deleteDevelopmentIntegrationMutation,
  developmentIntegrationsQuery,
  refreshDevelopmentPipelinesMutation,
  rotateDevelopmentIntegrationCredentialsMutation,
  testDevelopmentIntegrationMutation,
  updateDevelopmentIntegrationMutation,
} from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { GithubIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import * as styles from '../gitlab/setting-panel.css';
import { IntegrationSettingHeader } from '../setting';

export const JenkinsSettingPanel = () => {
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
  const { trigger: refreshTrigger } = useMutation({
    mutation: refreshDevelopmentPipelinesMutation,
  });

  const connection = data?.workspace?.developmentIntegrations?.find(
    item => item.provider === 'jenkins'
  );
  const connectionId = connection?.id;

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://ci.example.org');
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [newToken, setNewToken] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testOk, setTestOk] = useState(false);
  const [pipelineCount, setPipelineCount] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (connection) {
      setName(connection.name);
      setBaseUrl(connection.baseUrl);
      setUsername(connection.username ?? '');
    }
  }, [connection]);

  const handleCreate = useCallback(async () => {
    setBusy('create');
    try {
      await createTrigger({
        input: {
          workspaceId,
          provider: 'jenkins',
          name: name.trim() || 'Jenkins',
          baseUrl: baseUrl.trim(),
          token,
          username: username.trim() || undefined,
        },
      });
      notify.success({
        title: t['com.affine.integration.jenkins.connection.created'](),
      });
      setToken('');
      await revalidate();
    } catch {
      notify.error({
        title: t['com.affine.integration.jenkins.connection.create-failed'](),
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
    username,
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
        await updateTrigger({ input: { id: connectionId, enabled } });
        await revalidate();
      } catch {
        notify.error({
          title: t['com.affine.integration.jenkins.connection.update-failed'](),
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
          username: username.trim(),
        },
      });
      notify.success({
        title: t['com.affine.integration.jenkins.connection.updated'](),
      });
      await revalidate();
    } catch {
      notify.error({
        title: t['com.affine.integration.jenkins.connection.update-failed'](),
      });
    } finally {
      setBusy(null);
    }
  }, [baseUrl, connectionId, name, revalidate, t, updateTrigger, username]);

  const handleRotate = useCallback(async () => {
    if (!connectionId) {
      return;
    }
    setBusy('rotate');
    try {
      await rotateTrigger({ input: { id: connectionId, token: newToken } });
      notify.success({
        title: t['com.affine.integration.jenkins.connection.rotated'](),
      });
      setNewToken('');
      await revalidate();
    } catch {
      notify.error({
        title: t['com.affine.integration.jenkins.connection.update-failed'](),
      });
    } finally {
      setBusy(null);
    }
  }, [connectionId, newToken, revalidate, rotateTrigger, t]);

  const handleDelete = useCallback(async () => {
    if (!connectionId) {
      return;
    }
    setBusy('delete');
    try {
      await deleteTrigger({ connectionId });
      notify.success({
        title: t['com.affine.integration.jenkins.connection.deleted'](),
      });
      setPipelineCount(null);
      await revalidate();
    } catch {
      notify.error({
        title: t['com.affine.integration.jenkins.connection.delete-failed'](),
      });
    } finally {
      setBusy(null);
    }
  }, [connectionId, deleteTrigger, revalidate, t]);

  const handleRefresh = useCallback(async () => {
    if (!connectionId) {
      return;
    }
    setBusy('refresh');
    try {
      const result = await refreshTrigger({ connectionId });
      setPipelineCount(result.refreshDevelopmentPipelines.length);
      notify.success({
        title: t['com.affine.integration.jenkins.refreshed'](),
      });
    } catch {
      notify.error({
        title: t['com.affine.integration.jenkins.refresh-failed'](),
      });
    } finally {
      setBusy(null);
    }
  }, [connectionId, refreshTrigger, t]);

  return (
    <>
      <IntegrationSettingHeader
        icon={<GithubIcon />}
        name={t['com.affine.integration.jenkins.name']()}
        desc={t['com.affine.integration.jenkins.desc']()}
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
            {t['com.affine.integration.jenkins.connection.base-url']()}
            <input
              className={styles.input}
              value={baseUrl}
              onChange={event => {
                setBaseUrl(event.target.value);
              }}
            />
          </label>
          <label className={styles.label}>
            {t['com.affine.integration.jenkins.username']()}
            <input
              className={styles.input}
              value={username}
              onChange={event => {
                setUsername(event.target.value);
              }}
            />
          </label>
          <label className={styles.label}>
            {t['com.affine.integration.jenkins.connection.token']()}
            <input
              className={styles.input}
              type="password"
              value={token}
              onChange={event => {
                setToken(event.target.value);
              }}
            />
          </label>
          <Button
            onClick={() => void handleCreate()}
            disabled={busy !== null || !baseUrl.trim() || !token}
          >
            {t['com.affine.integration.jenkins.connection.create']()}
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
              {t['com.affine.integration.jenkins.connection.base-url']()}
              <input
                className={styles.input}
                value={baseUrl}
                onChange={event => {
                  setBaseUrl(event.target.value);
                }}
              />
            </label>
            <label className={styles.label}>
              {t['com.affine.integration.jenkins.username']()}
              <input
                className={styles.input}
                value={username}
                onChange={event => {
                  setUsername(event.target.value);
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
                  baseUrl.trim() === connection.baseUrl &&
                  username.trim() === (connection.username ?? ''))
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
            <Button onClick={() => void handleTest()} disabled={busy !== null}>
              {t['com.affine.integration.gitlab.connection.test']()}
            </Button>
            {testResult ? (
              <span className={testOk ? styles.ok : styles.error}>
                {testResult}
              </span>
            ) : null}
          </div>

          <div className={styles.row}>
            <Button
              onClick={() => void handleRefresh()}
              disabled={busy !== null}
            >
              {t['com.affine.integration.jenkins.refresh']()}
            </Button>
            {pipelineCount !== null ? (
              <span className={styles.muted}>{pipelineCount}</span>
            ) : null}
          </div>

          <div className={styles.separator} />

          <label className={styles.label}>
            {t['com.affine.integration.jenkins.connection.token']()}
            <input
              className={styles.input}
              type="password"
              value={newToken}
              onChange={event => {
                setNewToken(event.target.value);
              }}
            />
          </label>
          <Button
            onClick={() => void handleRotate()}
            disabled={busy !== null || !newToken}
          >
            {t['com.affine.integration.gitlab.connection.rotate']()}
          </Button>

          <div className={styles.separator} />

          <Button
            onClick={() => {
              openConfirmModal({
                title:
                  t[
                    'com.affine.integration.jenkins.connection.delete-confirm-title'
                  ](),
                description:
                  t[
                    'com.affine.integration.jenkins.connection.delete-confirm-description'
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
