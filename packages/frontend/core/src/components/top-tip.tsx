import { BrowserWarning } from '@affine/component/affine-banner';
import { Trans, useI18n } from '@affine/i18n';
import { useState } from 'react';

import type { Workspace } from '../modules/workspace';

const minimumChromeVersion = 106;

const shouldShowWarning = (() => {
  if (BUILD_CONFIG.isElectron) {
    return false;
  }
  if (BUILD_CONFIG.isMobileEdition) {
    return true;
  }
  if (environment.isChrome && environment.chromeVersion) {
    return environment.chromeVersion < minimumChromeVersion;
  }
  return false;
})();

const OSWarningMessage = () => {
  const t = useI18n();
  const notChrome = !environment.isChrome;
  const notGoodVersion =
    environment.isChrome &&
    environment.chromeVersion &&
    environment.chromeVersion < minimumChromeVersion;

  if (environment.isMobile) {
    return <span>{t['com.affine.top-tip.mobile']()}</span>;
  }

  if (notChrome) {
    return (
      <span>
        <Trans i18nKey="recommendBrowser">
          We recommend the <strong>Chrome</strong> browser for an optimal
          experience.
        </Trans>
      </span>
    );
  }

  return notGoodVersion ? <span>{t['upgradeBrowser']()}</span> : null;
};

export const TopTip = ({
  pageId: _pageId,
  workspace: _workspace,
}: {
  pageId?: string;
  workspace: Workspace;
}) => {
  const [showWarning, setShowWarning] = useState(shouldShowWarning);

  return (
    <BrowserWarning
      show={showWarning}
      message={<OSWarningMessage />}
      onClose={() => {
        setShowWarning(false);
      }}
    />
  );
};
