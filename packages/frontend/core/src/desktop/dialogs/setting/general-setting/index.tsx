import { UserFeatureService } from '@affine/core/modules/cloud/services/user-feature';
import type { SettingTab } from '@affine/core/modules/dialogs/constant';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { MeetingSettingsService } from '@affine/core/modules/media/services/meeting-settings';
import { useI18n } from '@affine/i18n';
import {
  AppearanceIcon,
  ExperimentIcon,
  FolderIcon,
  InformationIcon,
  KeyboardIcon,
  MeetingIcon,
  NotificationIcon,
  PenIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useServices } from '@toeverything/infra';
import { useEffect, useMemo } from 'react';

import { AuthService } from '../../../../modules/cloud';
import type { SettingSidebarItem, SettingState } from '../types';
import { AboutAffine } from './about';
import { AppearanceSettings } from './appearance';
import { BackupSettingPanel } from './backup';
import { EditorSettings } from './editor';
import { ExperimentalFeatures } from './experimental-features';
import { MeetingsSettings } from './meetings';
import { NotificationSettings } from './notifications';
import { Shortcuts } from './shortcuts';

export type GeneralSettingList = SettingSidebarItem[];

export const useGeneralSettingList = (): GeneralSettingList => {
  const t = useI18n();
  const {
    authService,
    userFeatureService,
    featureFlagService,
    meetingSettingsService,
  } = useServices({
    AuthService,
    UserFeatureService,
    FeatureFlagService,
    MeetingSettingsService,
  });
  const status = useLiveData(authService.session.status$);
  const loggedIn = status === 'authenticated';
  const enableEditorSettings = useLiveData(
    featureFlagService.flags.enable_editor_settings.$
  );

  useEffect(() => {
    userFeatureService.userFeature.revalidate();
  }, [userFeatureService]);

  const meetingSettings = useLiveData(meetingSettingsService.settings$);

  return useMemo(() => {
    const settings: GeneralSettingList = [
      {
        key: 'appearance',
        title: t['com.affine.settings.appearance'](),
        icon: <AppearanceIcon />,
        testId: 'appearance-panel-trigger',
      },
      {
        key: 'shortcuts',
        title: t['com.affine.keyboardShortcuts.title'](),
        icon: <KeyboardIcon />,
        testId: 'shortcuts-panel-trigger',
      },
    ];
    if (loggedIn) {
      settings.push({
        key: 'notifications',
        title: t['com.affine.setting.notifications'](),
        icon: <NotificationIcon />,
        testId: 'notifications-panel-trigger',
      });
    }
    if (enableEditorSettings) {
      // add editor settings to second position
      settings.splice(1, 0, {
        key: 'editor',
        title: t['com.affine.settings.editorSettings'](),
        icon: <PenIcon />,
        testId: 'editor-panel-trigger',
      });
    }

    if (
      (environment.isMacOs || environment.isWindows) &&
      BUILD_CONFIG.isElectron
    ) {
      settings.push({
        key: 'meetings',
        title: t['com.affine.settings.meetings'](),
        icon: <MeetingIcon />,
        testId: 'meetings-panel-trigger',
        beta: !meetingSettings?.enabled,
      });
    }

    if (BUILD_CONFIG.isElectron) {
      settings.push({
        key: 'backup',
        title: t['com.affine.settings.workspace.backup'](),
        icon: <FolderIcon />,
        testId: 'backup-panel-trigger',
      });
    }

    settings.push(
      {
        key: 'experimental-features',
        title: t['com.affine.settings.workspace.experimental-features'](),
        icon: <ExperimentIcon />,
        testId: 'experimental-features-trigger',
      },
      {
        key: 'about',
        title: t['com.affine.aboutAFFiNE.title'](),
        icon: <InformationIcon />,
        testId: 'about-panel-trigger',
      }
    );
    return settings;
  }, [t, loggedIn, enableEditorSettings, meetingSettings?.enabled]);
};

interface GeneralSettingProps {
  activeTab: SettingTab;
  onChangeSettingState: (settingState: SettingState) => void;
}

export const GeneralSetting = ({
  activeTab,
  onChangeSettingState: _onChangeSettingState,
}: GeneralSettingProps) => {
  switch (activeTab) {
    case 'shortcuts':
      return <Shortcuts />;
    case 'notifications':
      return <NotificationSettings />;
    case 'editor':
      return <EditorSettings />;
    case 'appearance':
      return <AppearanceSettings />;
    case 'meetings':
      return <MeetingsSettings />;
    case 'about':
      return <AboutAffine />;
    case 'plans':
    case 'billing':
      return <AppearanceSettings />;
    case 'experimental-features':
      return <ExperimentalFeatures />;
    case 'backup':
      return <BackupSettingPanel />;
    default:
      return null;
  }
};
