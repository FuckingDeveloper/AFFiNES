import { useI18n } from '@affine/i18n';

import { SettingGroup } from '../group';
import { RowLayout } from '../row.layout';

export const OthersGroup = () => {
  const t = useI18n();

  return (
    <SettingGroup title={t['com.affine.mobile.setting.others.support']()}>
      <RowLayout
        label="trackwork@mrhsoftware.com"
        href="mailto:trackwork@mrhsoftware.com"
      />
    </SettingGroup>
  );
};
