import { AppleOAuthProvider } from './apple';
import { GithubOAuthProvider } from './github';
import { GoogleOAuthProvider } from './google';
import { OIDCProvider } from './oidc';

// TrackWork keeps enterprise OIDC SSO, but does not expose consumer social
// providers such as Google, GitHub, or Apple.
export const OAuthProviders = env.testing
  ? [GoogleOAuthProvider, GithubOAuthProvider, OIDCProvider, AppleOAuthProvider]
  : [OIDCProvider];
