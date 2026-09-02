import { z } from 'zod';

import { defineModuleConfig } from '../../base';

export enum AuthMode {
  Password = 'password',
  LDAP = 'ldap',
  RADIUS = 'radius',
}

export interface AuthConfig {
  session: {
    ttl: number;
    ttr: number;
  };
  allowSignup: boolean;
  allowSignupForOauth: boolean;
  requireEmailDomainVerification: boolean;
  requireEmailVerification: boolean;
  mode: AuthMode;
  enterprise: {
    enabled: boolean;
    autoRegister: boolean;
    allowedEmailDomains: ConfigItem<string[]>;
    ldap: {
      enabled: boolean;
      url: string;
      bindDN: string;
      bindCredentials: string;
      searchBase: string;
      searchFilter: string;
      nameAttribute: string;
      connectTimeoutMs: number;
      timeoutMs: number;
      rejectUnauthorized: boolean;
    };
    radius: {
      enabled: boolean;
      host: string;
      port: number;
      secret: string;
      nasIpAddress: string;
      timeoutMs: number;
    };
  };
  passwordRequirements: ConfigItem<{
    min: number;
    max: number;
  }>;
}

declare global {
  interface AppConfigSchema {
    auth: AuthConfig;
  }
}

defineModuleConfig('auth', {
  allowSignup: {
    desc: 'Whether allow new registrations.',
    default: true,
  },
  allowSignupForOauth: {
    desc: 'Whether allow new registrations via configured oauth.',
    default: true,
  },
  requireEmailDomainVerification: {
    desc: 'Whether require email domain record verification before accessing restricted resources.',
    default: false,
  },
  requireEmailVerification: {
    desc: 'Whether require email verification before accessing restricted resources(not implemented).',
    default: true,
  },
  mode: {
    desc: 'Active authentication method. Only one method can be active at a time.',
    default: AuthMode.Password,
    shape: z.nativeEnum(AuthMode),
    env: ['AFFINE_AUTH_MODE', 'string'],
  },
  'enterprise.enabled': {
    desc: 'Whether enterprise authentication backends are enabled.',
    default: false,
  },
  'enterprise.autoRegister': {
    desc: 'Whether users authenticated by enterprise backends can be auto-created.',
    default: false,
  },
  'enterprise.allowedEmailDomains': {
    desc: 'Optional allow list for enterprise auth in the form of email domains.',
    default: [],
    shape: z.array(z.string().trim().min(1)),
    schema: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  'enterprise.ldap.enabled': {
    desc: 'Whether LDAP authentication backend is enabled.',
    default: false,
  },
  'enterprise.ldap.url': {
    desc: 'LDAP server URL (ldap:// or ldaps://).',
    default: '',
  },
  'enterprise.ldap.bindDN': {
    desc: 'LDAP service bind DN used to search users.',
    default: '',
  },
  'enterprise.ldap.bindCredentials': {
    desc: 'LDAP service bind password.',
    default: '',
  },
  'enterprise.ldap.searchBase': {
    desc: 'LDAP search base DN.',
    default: '',
  },
  'enterprise.ldap.searchFilter': {
    desc: 'LDAP search filter with placeholders {{email}} and {{username}}.',
    default:
      '(|(mail={{email}})(userPrincipalName={{email}})(uid={{username}}))',
  },
  'enterprise.ldap.nameAttribute': {
    desc: 'LDAP attribute used as display name when auto-registering users.',
    default: 'displayName',
  },
  'enterprise.ldap.connectTimeoutMs': {
    desc: 'LDAP TCP connect timeout in milliseconds.',
    default: 5000,
  },
  'enterprise.ldap.timeoutMs': {
    desc: 'LDAP operation timeout in milliseconds.',
    default: 8000,
  },
  'enterprise.ldap.rejectUnauthorized': {
    desc: 'Whether to reject invalid TLS certificates for LDAPS.',
    default: true,
  },
  'enterprise.radius.enabled': {
    desc: 'Whether RADIUS authentication backend is enabled.',
    default: false,
  },
  'enterprise.radius.host': {
    desc: 'RADIUS server host.',
    default: '',
  },
  'enterprise.radius.port': {
    desc: 'RADIUS server port.',
    default: 1812,
  },
  'enterprise.radius.secret': {
    desc: 'RADIUS shared secret.',
    default: '',
  },
  'enterprise.radius.nasIpAddress': {
    desc: 'NAS-IP-Address sent in RADIUS Access-Request.',
    default: '127.0.0.1',
  },
  'enterprise.radius.timeoutMs': {
    desc: 'RADIUS request timeout in milliseconds.',
    default: 5000,
  },
  passwordRequirements: {
    desc: 'The password strength requirements when set new password.',
    default: {
      min: 8,
      max: 32,
    },
    shape: z
      .object({
        min: z.number().min(1),
        max: z.number().max(100),
      })
      .strict()
      .refine(data => data.min < data.max, {
        message: 'Minimum length of password must be less than maximum length',
      }),
    schema: {
      type: 'object',
      properties: {
        min: { type: 'number' },
        max: { type: 'number' },
      },
    },
  },
  'session.ttl': {
    desc: 'Application auth expiration time in seconds.',
    default: 60 * 60 * 24 * 15, // 15 days
  },
  'session.ttr': {
    desc: 'Application auth time to refresh in seconds.',
    default: 60 * 60 * 24 * 7, // 7 days
  },
});
