import { ROUTES } from '@affine/routes';
import { SettingsIcon } from '@blocksuite/icons/rc';

import { useI18n } from '../../i18n';
import { NavItem } from './nav-item';

export const SettingsItem = ({ isCollapsed }: { isCollapsed: boolean }) => {
  const { t } = useI18n();
  return (
    <NavItem
      to={ROUTES.admin.settings.index}
      icon={<SettingsIcon fontSize={20} />}
      label={t('nav.settings')}
      isCollapsed={isCollapsed}
    />
  );
};
