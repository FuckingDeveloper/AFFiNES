import type { Package } from '@affine-tools/utils/workspace';

import { PackageToDistribution } from './distribution';

export interface BuildFlags {
  channel: 'stable' | 'beta' | 'internal' | 'canary';
  mode: 'development' | 'production';
}

export function getBuildConfig(
  pkg: Package,
  buildFlags: BuildFlags
): BUILD_CONFIG_TYPE {
  const buildDate = new Date();
  const buildStamp = buildDate
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '.')
    .slice(0, 13);
  const revision = (process.env.GITHUB_SHA ?? 'local').slice(0, 8);
  const displayVersion = `v${pkg.version} · ${buildStamp} · ${revision}`;
  const distribution = PackageToDistribution.get(pkg.name);

  if (!distribution) {
    throw new Error(`Distribution for ${pkg.name} is not found`);
  }

  const buildPreset: Record<BuildFlags['channel'], BUILD_CONFIG_TYPE> = {
    get stable() {
      return {
        debug: buildFlags.mode === 'development',
        distribution,
        isDesktopEdition: (
          ['web', 'desktop', 'admin'] as BUILD_CONFIG_TYPE['distribution'][]
        ).includes(distribution),
        isMobileEdition: (
          ['mobile', 'ios', 'android'] as BUILD_CONFIG_TYPE['distribution'][]
        ).includes(distribution),
        isElectron: distribution === 'desktop',
        isWeb: distribution === 'web',
        isMobileWeb: distribution === 'mobile',
        isIOS: distribution === 'ios',
        isAndroid: distribution === 'android',
        isNative:
          distribution === 'desktop' ||
          distribution === 'ios' ||
          distribution === 'android',
        isAdmin: distribution === 'admin',

        appBuildType: 'stable' as const,
        appVersion: pkg.version,
        displayVersion,
        // editorVersion: pkg.dependencies['@blocksuite/affine'],
        editorVersion: pkg.version,
        productName: 'MRH TrackWork',
        productShortName: 'TrackWork',
        websiteUrl: 'https://trackwork.mrhsoftware.com',
        helpUrl: 'https://trackwork.mrhsoftware.com/help',
        supportEmail: 'trackwork@mrhsoftware.com',
        githubUrl: 'https://github.com/toeverything/AFFiNE',
        changelogUrl: 'https://trackwork.mrhsoftware.com/help',
        downloadUrl: 'https://trackwork.mrhsoftware.com',
        pricingUrl: 'https://trackwork.mrhsoftware.com',
        discordUrl: 'https://trackwork.mrhsoftware.com/help',
        requestLicenseUrl: 'mailto:trackwork@mrhsoftware.com',
        imageProxyUrl: '/api/worker/image-proxy',
        linkPreviewUrl: '/api/worker/link-preview',
        CAPTCHA_SITE_KEY: process.env.CAPTCHA_SITE_KEY ?? '',
        SENTRY_DSN: process.env.SENTRY_DSN ?? '',
      };
    },
    get beta() {
      return {
        ...this.stable,
        appBuildType: 'beta' as const,
      };
    },
    get internal() {
      return {
        ...this.stable,
        appBuildType: 'internal' as const,
      };
    },
    // canary will be aggressive and enable all features
    get canary() {
      return {
        ...this.stable,
        appBuildType: 'canary' as const,
      };
    },
  };

  const currentBuild = buildFlags.channel;

  if (!(currentBuild in buildPreset)) {
    throw new Error(`BUILD_TYPE ${currentBuild} is not supported`);
  }

  const currentBuildPreset = buildPreset[currentBuild];

  const environmentPreset = {
    changelogUrl: process.env.CHANGELOG_URL ?? currentBuildPreset.changelogUrl,
  };

  return {
    ...currentBuildPreset,
    // environment preset will overwrite current build preset
    // this environment variable is for debug proposes only
    // do not put them into CI
    ...(process.env.CI ? {} : environmentPreset),
  };
}
