import { FlexWrapper, Input, notify } from '@affine/component';
import {
  SettingHeader,
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import { Avatar } from '@affine/component/ui/avatar';
import { Button } from '@affine/component/ui/button';
import { useSignOut } from '@affine/core/components/hooks/affine/use-sign-out';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useCatchEventCallback } from '@affine/core/components/hooks/use-catch-event-hook';
import { Upload } from '@affine/core/components/pure/file-upload';
import { GlobalDialogService } from '@affine/core/modules/dialogs';
import { UserFriendlyError } from '@affine/error';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { ArrowRightSmallIcon, CameraIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService, useServices } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';

import { AuthService, ServerService } from '../../../../modules/cloud';
import type { SettingState } from '../types';
import { AIUsagePanel } from './ai-usage-panel';
import { DeleteAccount } from './delete-account';
import { IntegrationsPanel } from './integrations-panel';
import { StorageProgress } from './storage-progress';
import * as styles from './style.css';

interface TwoFactorSetupData {
  secret: string;
  issuer: string;
  otpauthUrl: string;
}

export const UserAvatar = () => {
  const t = useI18n();
  const session = useService(AuthService).session;
  const account = useLiveData(session.account$);

  const handleUpdateUserAvatar = useAsyncCallback(
    async (file: File) => {
      try {
        track.$.settingsPanel.accountSettings.uploadAvatar();
        await session.uploadAvatar(file);
        notify.success({ title: 'Update user avatar success' });
      } catch (e) {
        // TODO(@catsjuice): i18n
        notify.error({
          title: 'Update user avatar failed',
          message: String(e),
        });
      }
    },
    [session]
  );

  const handleRemoveUserAvatar = useCatchEventCallback(async () => {
    track.$.settingsPanel.accountSettings.removeAvatar();
    await session.removeAvatar();
  }, [session]);

  return (
    <Upload
      accept="image/gif,image/jpeg,image/jpg,image/png,image/svg"
      fileChange={handleUpdateUserAvatar}
      data-testid="upload-user-avatar"
    >
      <Avatar
        size={56}
        name={account?.label}
        url={account?.avatar}
        hoverIcon={<CameraIcon />}
        onRemove={account?.avatar ? handleRemoveUserAvatar : undefined}
        avatarTooltipOptions={{ content: t['Click to replace photo']() }}
        removeTooltipOptions={{ content: t['Remove photo']() }}
        data-testid="user-setting-avatar"
        removeButtonProps={{
          ['data-testid' as string]: 'user-setting-remove-avatar-button',
        }}
      />
    </Upload>
  );
};

export const AvatarAndName = () => {
  const t = useI18n();
  const session = useService(AuthService).session;
  const account = useLiveData(session.account$);
  const [input, setInput] = useState<string>(account?.label ?? '');

  const allowUpdate = !!input && input !== account?.label;
  const handleUpdateUserName = useAsyncCallback(async () => {
    if (account === null) {
      return;
    }
    if (!allowUpdate) {
      return;
    }

    try {
      track.$.settingsPanel.accountSettings.updateUserName();
      await session.updateLabel(input);
    } catch (e) {
      notify.error({
        title: 'Failed to update user name.',
        message: String(e),
      });
    }
  }, [account, allowUpdate, session, input]);

  return (
    <SettingRow
      name={t['com.affine.settings.profile']()}
      desc={t['com.affine.settings.profile.message']()}
      spreadCol={false}
    >
      <FlexWrapper style={{ margin: '12px 0 24px 0' }} alignItems="center">
        <UserAvatar />

        <div className={styles.profileInputWrapper}>
          <label>{t['com.affine.settings.profile.name']()}</label>
          <FlexWrapper alignItems="center">
            <Input
              defaultValue={input}
              data-testid="user-name-input"
              placeholder={t['com.affine.settings.profile.placeholder']()}
              maxLength={64}
              minLength={0}
              style={{ width: 280, height: 32 }}
              onChange={setInput}
              onEnter={handleUpdateUserName}
            />
            {allowUpdate ? (
              <Button
                data-testid="save-user-name"
                onClick={handleUpdateUserName}
                style={{
                  marginLeft: '12px',
                }}
              >
                {t['com.affine.editCollection.save']()}
              </Button>
            ) : null}
          </FlexWrapper>
        </div>
      </FlexWrapper>
    </SettingRow>
  );
};

const TwoFactorPanel = ({ hasPassword }: { hasPassword: boolean }) => {
  const t = useI18n();
  const authService = useService(AuthService);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [setupData, setSetupData] = useState<TwoFactorSetupData | null>(null);
  const [setupQrDataUrl, setSetupQrDataUrl] = useState<string>('');
  const [enableCode, setEnableCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [pending, setPending] = useState(false);

  const fetchStatus = useAsyncCallback(async () => {
    setLoading(true);
    try {
      const status = await authService.getTwoFactorStatus();
      setEnabled(status.enabled);
      if (status.enabled) {
        setSetupData(null);
      }
    } catch (err) {
      notify.error({
        title: t['com.affine.settings.two-factor.notify.load-failed.title'](),
        message: UserFriendlyError.fromAny(err).message,
      });
    } finally {
      setLoading(false);
    }
  }, [authService, t]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!setupData?.otpauthUrl) {
      setSetupQrDataUrl('');
      return;
    }
    void QRCode.toDataURL(setupData.otpauthUrl, {
      width: 280,
      margin: 1,
    }).then(setSetupQrDataUrl);
  }, [setupData?.otpauthUrl]);

  const onStartSetup = useAsyncCallback(async () => {
    setPending(true);
    try {
      const setup = await authService.createTwoFactorSetup();
      setSetupData(setup);
      setEnableCode('');
    } finally {
      setPending(false);
    }
  }, [authService]);

  const onEnable = useAsyncCallback(async () => {
    if (!setupData) {
      return;
    }
    const code = enableCode.replace(/\D+/g, '').slice(0, 6);
    if (code.length !== 6) {
      notify.error({
        title: t['com.affine.settings.two-factor.error.invalid-code.title'](),
        message:
          t['com.affine.settings.two-factor.error.invalid-code.message'](),
      });
      return;
    }
    setPending(true);
    try {
      await authService.enableTwoFactor(setupData.secret, code);
      notify.success({
        title: t['com.affine.settings.two-factor.notify.enabled.title'](),
      });
      setSetupData(null);
      setEnableCode('');
      await fetchStatus();
    } catch (err) {
      const error = UserFriendlyError.fromAny(err);
      notify.error({
        title: t['com.affine.settings.two-factor.notify.enable-failed.title'](),
        message:
          error.is('BAD_REQUEST') && error.message === 'TWO_FACTOR_INVALID'
            ? t['com.affine.settings.two-factor.error.invalid-code.try-again']()
            : error.message,
      });
    } finally {
      setPending(false);
    }
  }, [authService, enableCode, fetchStatus, setupData, t]);

  const onDisable = useAsyncCallback(async () => {
    const code = disableCode.replace(/\D+/g, '').slice(0, 6);
    if (code.length !== 6) {
      notify.error({
        title: t['com.affine.settings.two-factor.error.invalid-code.title'](),
        message:
          t['com.affine.settings.two-factor.error.invalid-code.message'](),
      });
      return;
    }
    setPending(true);
    try {
      await authService.disableTwoFactor(code);
      notify.success({
        title: t['com.affine.settings.two-factor.notify.disabled.title'](),
      });
      setDisableCode('');
      await fetchStatus();
    } catch (err) {
      const error = UserFriendlyError.fromAny(err);
      notify.error({
        title:
          t['com.affine.settings.two-factor.notify.disable-failed.title'](),
        message:
          error.is('BAD_REQUEST') && error.message === 'TWO_FACTOR_INVALID'
            ? t['com.affine.settings.two-factor.error.invalid-code.try-again']()
            : error.message,
      });
    } finally {
      setPending(false);
    }
  }, [authService, disableCode, fetchStatus, t]);

  const onCopySecret = useCatchEventCallback(async () => {
    if (!setupData?.secret) {
      return;
    }
    await navigator.clipboard.writeText(setupData.secret);
    notify.success({
      title: t['com.affine.settings.two-factor.notify.secret-copied.title'](),
    });
  }, [setupData?.secret, t]);

  return (
    <>
      <SettingRow
        name={t['com.affine.settings.two-factor.title']()}
        desc={
          hasPassword
            ? t['com.affine.settings.two-factor.description.enabled']()
            : t['com.affine.settings.two-factor.description.no-password']()
        }
      >
        {enabled ? (
          <Button
            data-testid="two-factor-enabled-indicator"
            variant="secondary"
            disabled={true}
          >
            {t['com.affine.settings.two-factor.status.enabled']()}
          </Button>
        ) : (
          <Button
            data-testid="two-factor-enable-button"
            disabled={loading || pending || !hasPassword}
            onClick={onStartSetup}
          >
            {t['com.affine.settings.two-factor.action.enable']()}
          </Button>
        )}
      </SettingRow>
      {enabled ? (
        <SettingRow
          name={t['com.affine.settings.two-factor.disable.title']()}
          desc={t['com.affine.settings.two-factor.disable.description']()}
        >
          <FlexWrapper alignItems="center" style={{ gap: '8px' }}>
            <Input
              data-testid="two-factor-disable-code-input"
              className={styles.twoFactorCodeInput}
              placeholder={t[
                'com.affine.settings.two-factor.code.placeholder'
              ]()}
              value={disableCode}
              maxLength={6}
              onChange={value => {
                setDisableCode(value.replace(/\D+/g, '').slice(0, 6));
              }}
            />
            <Button
              data-testid="two-factor-disable-confirm-button"
              variant="secondary"
              disabled={pending}
              onClick={onDisable}
            >
              {t['com.affine.settings.two-factor.action.disable']()}
            </Button>
          </FlexWrapper>
        </SettingRow>
      ) : null}
      {setupData ? (
        <SettingRow
          name={t['com.affine.settings.two-factor.setup.title']()}
          desc={t['com.affine.settings.two-factor.setup.description']({
            issuer: setupData.issuer,
          })}
          spreadCol={false}
        >
          <div className={styles.twoFactorPanel}>
            <div className={styles.twoFactorQr}>
              {setupQrDataUrl ? (
                <img
                  className={styles.twoFactorQrImg}
                  src={setupQrDataUrl}
                  alt={t['com.affine.settings.two-factor.setup.qr.alt']()}
                />
              ) : (
                <FlexWrapper
                  alignItems="center"
                  justifyContent="center"
                  style={{ height: '100%', fontSize: 12, padding: 8 }}
                >
                  {t['com.affine.settings.two-factor.setup.qr.unavailable']()}
                </FlexWrapper>
              )}
            </div>
            <div className={styles.twoFactorPanelContent}>
              <div className={styles.twoFactorPanelTitle}>
                {t['com.affine.settings.two-factor.setup.secret.title']()}
              </div>
              <div
                data-testid="two-factor-secret"
                className={styles.twoFactorSecret}
              >
                {setupData.secret}
              </div>
              <div className={styles.twoFactorActions}>
                <Button
                  data-testid="two-factor-copy-secret-button"
                  variant="secondary"
                  onClick={onCopySecret}
                >
                  {t['com.affine.settings.two-factor.action.copy-secret']()}
                </Button>
              </div>
              <FlexWrapper
                alignItems="center"
                style={{ gap: '8px', marginTop: '10px' }}
              >
                <Input
                  data-testid="two-factor-setup-code-input"
                  className={styles.twoFactorCodeInput}
                  placeholder={t[
                    'com.affine.settings.two-factor.code.placeholder'
                  ]()}
                  value={enableCode}
                  maxLength={6}
                  onChange={value => {
                    setEnableCode(value.replace(/\D+/g, '').slice(0, 6));
                  }}
                />
                <Button
                  data-testid="two-factor-setup-confirm-button"
                  disabled={pending}
                  onClick={onEnable}
                >
                  {t['com.affine.settings.two-factor.action.confirm-enable']()}
                </Button>
                <Button
                  data-testid="two-factor-setup-cancel-button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    setSetupData(null);
                    setEnableCode('');
                  }}
                >
                  {t['com.affine.settings.two-factor.action.cancel']()}
                </Button>
              </FlexWrapper>
            </div>
          </div>
        </SettingRow>
      ) : null}
    </>
  );
};

const StoragePanel = ({
  onChangeSettingState,
}: {
  onChangeSettingState?: (settingState: SettingState) => void;
}) => {
  const t = useI18n();

  const onUpgrade = useCallback(() => {
    onChangeSettingState?.({
      activeTab: 'account',
    });
  }, [onChangeSettingState]);

  return (
    <SettingRow
      name={t['com.affine.storage.title']()}
      desc=""
      spreadCol={false}
    >
      <StorageProgress onUpgrade={onUpgrade} />
    </SettingRow>
  );
};

export const AccountSetting = ({
  onChangeSettingState,
}: {
  onChangeSettingState?: (settingState: SettingState) => void;
}) => {
  const { authService, serverService, globalDialogService } = useServices({
    AuthService,
    ServerService,
    GlobalDialogService,
  });
  const serverFeatures = useLiveData(serverService.server.features$);
  const t = useI18n();
  const session = authService.session;
  useEffect(() => {
    session.revalidate();
  }, [session]);
  const account = useLiveData(session.account$);
  const openSignOutModal = useSignOut();

  const onChangeEmail = useCallback(() => {
    if (!account) {
      return;
    }
    globalDialogService.open('verify-email', {
      server: serverService.server.baseUrl,
      changeEmail: !!account.info?.emailVerified,
    });
  }, [account, globalDialogService, serverService.server.baseUrl]);

  const onPasswordButtonClick = useCallback(() => {
    globalDialogService.open('change-password', {
      server: serverService.server.baseUrl,
    });
  }, [globalDialogService, serverService.server.baseUrl]);

  if (!account) {
    return null;
  }

  return (
    <>
      <SettingHeader
        title={t['com.affine.setting.account']()}
        subtitle={t['com.affine.setting.account.message']()}
        data-testid="account-title"
      />
      <AvatarAndName />
      <SettingWrapper>
        <SettingRow
          name={t['com.affine.settings.email']()}
          desc={account.email}
        >
          <Button onClick={onChangeEmail}>
            {account.info?.emailVerified
              ? t['com.affine.settings.email.action.change']()
              : t['com.affine.settings.email.action.verify']()}
          </Button>
        </SettingRow>
        <SettingRow
          name={t['com.affine.settings.password']()}
          desc={t['com.affine.settings.password.message']()}
        >
          <Button onClick={onPasswordButtonClick}>
            {account.info?.hasPassword
              ? t['com.affine.settings.password.action.change']()
              : t['com.affine.settings.password.action.set']()}
          </Button>
        </SettingRow>
        <TwoFactorPanel hasPassword={!!account.info?.hasPassword} />
        <StoragePanel onChangeSettingState={onChangeSettingState} />
        {serverFeatures?.copilot && (
          <AIUsagePanel onChangeSettingState={onChangeSettingState} />
        )}
        <IntegrationsPanel onChangeSettingState={onChangeSettingState} />
        <SettingRow
          name={t[`Sign out`]()}
          desc={t['com.affine.setting.sign.out.message']()}
          style={{ cursor: 'pointer' }}
          data-testid="sign-out-button"
          onClick={openSignOutModal}
        >
          <ArrowRightSmallIcon />
        </SettingRow>
      </SettingWrapper>
      <DeleteAccount />
    </>
  );
};
