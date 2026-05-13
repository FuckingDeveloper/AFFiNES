import { randomInt } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { isIP } from 'node:net';

import { Injectable, Logger } from '@nestjs/common';

import { Config } from '../../base';

type EnterpriseAuthProvider = 'ldap' | 'radius';

export interface EnterpriseAuthResult {
  authenticated: boolean;
  provider?: EnterpriseAuthProvider;
  displayName?: string;
}

function escapeLdapFilterValue(value: string) {
  return value.replaceAll(/[\\()*\u0000]/g, ch => {
    switch (ch) {
      case '\\':
        return '\\5c';
      case '*':
        return '\\2a';
      case '(':
        return '\\28';
      case ')':
        return '\\29';
      case '\u0000':
        return '\\00';
      default:
        return ch;
    }
  });
}

function normalizeDomainList(domains: string[]) {
  return domains.map(domain => domain.trim().toLowerCase()).filter(Boolean);
}

@Injectable()
export class EnterpriseAuthService {
  private readonly logger = new Logger(EnterpriseAuthService.name);

  constructor(private readonly config: Config) {}

  isEnabled() {
    return this.config.auth.enterprise.enabled;
  }

  canAutoRegister() {
    return this.config.auth.enterprise.autoRegister;
  }

  canTryPasswordSignIn(
    email: string,
    hasLocalPassword: boolean,
    userExists: boolean
  ) {
    if (hasLocalPassword) {
      return true;
    }

    if (!this.isEnabled()) {
      return false;
    }

    if (!this.isDomainAllowed(email)) {
      return false;
    }

    if (userExists) {
      return true;
    }

    return this.canAutoRegister();
  }

  async authenticate(
    email: string,
    password: string
  ): Promise<EnterpriseAuthResult> {
    if (!this.isEnabled() || !this.isDomainAllowed(email)) {
      return { authenticated: false };
    }

    const ldapResult = await this.authenticateWithLdap(email, password);
    if (ldapResult.authenticated) {
      return ldapResult;
    }

    const radiusResult = await this.authenticateWithRadius(email, password);
    if (radiusResult.authenticated) {
      return radiusResult;
    }

    return { authenticated: false };
  }

  private isDomainAllowed(email: string) {
    const allowList = normalizeDomainList(
      this.config.auth.enterprise.allowedEmailDomains
    );
    if (!allowList.length) {
      return true;
    }

    const [, domain] = email.toLowerCase().split('@');
    return !!domain && allowList.includes(domain);
  }

  private async authenticateWithLdap(
    email: string,
    password: string
  ): Promise<EnterpriseAuthResult> {
    const ldapConfig = this.config.auth.enterprise.ldap;
    if (!ldapConfig.enabled || !ldapConfig.url || !ldapConfig.searchBase) {
      return { authenticated: false };
    }

    const username = email.split('@')[0] ?? email;
    const filter = ldapConfig.searchFilter
      .replaceAll('{{email}}', escapeLdapFilterValue(email))
      .replaceAll('{{username}}', escapeLdapFilterValue(username));

    const attributes = Array.from(
      new Set(
        ['dn', 'cn', 'displayName', ldapConfig.nameAttribute].filter(Boolean)
      )
    );

    const LdapClient = await this.loadLdapClient();
    if (!LdapClient) {
      return { authenticated: false };
    }

    const client = new LdapClient({
      url: ldapConfig.url,
      timeout: ldapConfig.timeoutMs,
      connectTimeout: ldapConfig.connectTimeoutMs,
      tlsOptions: {
        rejectUnauthorized: ldapConfig.rejectUnauthorized,
      },
    });

    try {
      await client.bind(ldapConfig.bindDN, ldapConfig.bindCredentials);

      const { searchEntries } = await client.search(ldapConfig.searchBase, {
        scope: 'sub',
        filter,
        sizeLimit: 2,
        attributes,
      });

      if (searchEntries.length !== 1) {
        return { authenticated: false };
      }

      const userEntry = searchEntries[0] as {
        dn?: string;
        [key: string]: unknown;
      };
      const userDn = typeof userEntry.dn === 'string' ? userEntry.dn : '';
      if (!userDn) {
        return { authenticated: false };
      }

      await client.bind(userDn, password);

      const displayNameValue = userEntry[ldapConfig.nameAttribute];
      const displayName =
        typeof displayNameValue === 'string'
          ? displayNameValue
          : Array.isArray(displayNameValue) &&
              typeof displayNameValue[0] === 'string'
            ? displayNameValue[0]
            : undefined;

      return {
        authenticated: true,
        provider: 'ldap',
        displayName,
      };
    } catch (error) {
      this.logger.debug(
        `LDAP auth failed for ${email}: ${error instanceof Error ? error.message : String(error)}`
      );
      return { authenticated: false };
    } finally {
      try {
        await client.unbind();
      } catch {
        // ignore unbind errors
      }
    }
  }

  private async authenticateWithRadius(
    email: string,
    password: string
  ): Promise<EnterpriseAuthResult> {
    const radiusConfig = this.config.auth.enterprise.radius;
    if (
      !radiusConfig.enabled ||
      !radiusConfig.host ||
      !radiusConfig.secret ||
      !radiusConfig.port
    ) {
      return { authenticated: false };
    }

    const radiusModule = await this.loadRadiusModule();
    if (!radiusModule) {
      return { authenticated: false };
    }
    const radius =
      'default' in radiusModule ? radiusModule.default : radiusModule;

    return new Promise<EnterpriseAuthResult>(resolve => {
      const socket = createSocket('udp4');
      const timer = setTimeout(() => {
        socket.close();
        resolve({ authenticated: false });
      }, radiusConfig.timeoutMs);

      const packet = radius.encode({
        code: 'Access-Request',
        secret: radiusConfig.secret,
        identifier: randomInt(0, 256),
        attributes: {
          'User-Name': email,
          'User-Password': password,
          ...(isIP(radiusConfig.nasIpAddress)
            ? { 'NAS-IP-Address': radiusConfig.nasIpAddress }
            : { 'NAS-Identifier': radiusConfig.nasIpAddress }),
        },
      });

      socket.on('message', message => {
        clearTimeout(timer);
        try {
          const decoded = radius.decode({
            packet: message,
            secret: radiusConfig.secret,
          });
          socket.close();
          resolve({
            authenticated: decoded.code === 'Access-Accept',
            provider: decoded.code === 'Access-Accept' ? 'radius' : undefined,
          });
        } catch {
          socket.close();
          resolve({ authenticated: false });
        }
      });

      socket.on('error', () => {
        clearTimeout(timer);
        socket.close();
        resolve({ authenticated: false });
      });

      socket.send(packet, radiusConfig.port, radiusConfig.host, err => {
        if (err) {
          clearTimeout(timer);
          socket.close();
          resolve({ authenticated: false });
        }
      });
    });
  }

  private async loadLdapClient() {
    try {
      const { Client } = await import('ldapts');
      return Client;
    } catch (error) {
      this.logger.warn(
        `LDAP backend requested but ldapts is unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  private async loadRadiusModule() {
    try {
      return await import('radius');
    } catch (error) {
      this.logger.warn(
        `RADIUS backend requested but radius package is unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }
}
