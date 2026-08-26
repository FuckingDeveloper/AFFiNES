import { ServerAuthMode, ServerDeploymentType } from '@affine/graphql';

import type { ServerConfig, ServerMetadata } from './types';

/**
 * TrackWork is distributed as a self-hosted product. The built-in server must
 * never silently point users or telemetry at AFFiNE Cloud.
 *
 * The `affine-cloud` id is intentionally preserved because it is persisted in
 * existing local databases and changing it would disconnect existing users
 * from their workspaces.
 */
export const BUILD_IN_SERVERS: (ServerMetadata & { config: ServerConfig })[] = [
  {
    id: 'affine-cloud',
    baseUrl: BUILD_CONFIG.isNative ? BUILD_CONFIG.websiteUrl : location.origin,
    config: {
      serverName: BUILD_CONFIG.productName,
      features: [],
      oauthProviders: [],
      authMode: ServerAuthMode.Password,
      type: ServerDeploymentType.Selfhosted,
      credentialsRequirement: {
        password: {
          minLength: 8,
          maxLength: 32,
        },
      },
    },
  },
];

export type TelemetryChannel =
  | 'stable'
  | 'beta'
  | 'internal'
  | 'canary'
  | 'local';

export function getOfficialTelemetryEndpoint(
  _channel?: TelemetryChannel
): string {
  return BUILD_CONFIG.isNative ? BUILD_CONFIG.websiteUrl : location.origin;
}
