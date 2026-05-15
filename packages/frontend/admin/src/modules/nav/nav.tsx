import { cn } from '@affine/admin/utils';
import { ROUTES } from '@affine/routes';
import { AccountIcon, SelfhostIcon } from '@blocksuite/icons/rc';
import {
  BarChart3Icon,
  LayoutDashboardIcon,
  ListChecksIcon,
} from 'lucide-react';

import { useI18n } from '../../i18n';
import { NavItem } from './nav-item';
import { LanguageSwitcher } from './language-switcher';
import { ServerVersion } from './server-version';
import { SettingsItem } from './settings-item';
import { UserDropdown } from './user-dropdown';

interface NavProps {
  isCollapsed?: boolean;
}

export function Nav({ isCollapsed = false }: NavProps) {
  const { t } = useI18n();

  return (
    <div
      className={cn(
        'flex h-full flex-grow flex-col justify-between gap-4 py-2',
        isCollapsed && 'overflow-visible'
      )}
    >
      <nav
        className={cn(
          'flex flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto px-2',
          isCollapsed && 'items-center px-0 gap-1 overflow-visible'
        )}
      >
        {environment.isSelfHosted ? null : (
          <NavItem
            to={ROUTES.admin.dashboard}
            icon={<BarChart3Icon size={18} />}
            label={t('nav.dashboard')}
            isCollapsed={isCollapsed}
          />
        )}
        <NavItem
          to={ROUTES.admin.accounts}
          icon={<AccountIcon fontSize={20} />}
          label={t('nav.accounts')}
          isCollapsed={isCollapsed}
        />
        {environment.isSelfHosted ? null : (
          <NavItem
            to={ROUTES.admin.workspaces}
            icon={<LayoutDashboardIcon size={18} />}
            label={t('nav.workspaces')}
            isCollapsed={isCollapsed}
          />
        )}
        <NavItem
          to={ROUTES.admin.queue}
          icon={<ListChecksIcon size={18} />}
          label={t('nav.queue')}
          isCollapsed={isCollapsed}
        />
        <SettingsItem isCollapsed={isCollapsed} />
        <NavItem
          to={ROUTES.admin.about}
          icon={<SelfhostIcon fontSize={20} />}
          label={t('nav.about')}
          isCollapsed={isCollapsed}
        />
      </nav>
      <div
        className={cn(
          'flex flex-col gap-2 overflow-hidden px-2',
          isCollapsed && 'items-center px-0 gap-1'
        )}
      >
        {isCollapsed ? null : <LanguageSwitcher />}
        <UserDropdown isCollapsed={isCollapsed} />
        {isCollapsed ? null : <ServerVersion />}
      </div>
    </div>
  );
}
