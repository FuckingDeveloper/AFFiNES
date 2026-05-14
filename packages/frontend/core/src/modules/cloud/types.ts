import type {
  CredentialsRequirementType,
  OAuthProviderType,
  ServerAuthMode,
  ServerDeploymentType,
  ServerFeature,
} from '@affine/graphql';

export interface ServerMetadata {
  id: string;

  baseUrl: string;
}

export interface ServerConfig {
  serverName: string;
  features: ServerFeature[];
  oauthProviders: OAuthProviderType[];
  authMode: ServerAuthMode;
  type: ServerDeploymentType;
  initialized?: boolean;
  version?: string;
  credentialsRequirement: CredentialsRequirementType;
}
