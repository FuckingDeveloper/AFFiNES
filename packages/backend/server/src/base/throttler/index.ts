import './config';

import {
  ExecutionContext,
  Global,
  Injectable,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModule,
  type ThrottlerModuleOptions,
  ThrottlerOptionsFactory,
  type ThrottlerRequest,
  type ThrottlerStorage as ThrottlerStorageContract,
} from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { Config } from '../config';
import { getRequestResponseFromContext } from '../utils/request';
import { getRequestTrackerId } from '../utils/request-tracker';
import type { ThrottlerType } from './config';
import { THROTTLER_PROTECTED, Throttlers } from './decorators';

type ThrottlerRecord = {
  totalHits: Map<string, number>;
  expiresAt: number;
  blockExpiresAt: number;
  isBlocked: boolean;
};

type ThrottlerStorageRecord = {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
};

/**
 * Project-owned throttler storage implementing the documented
 * `ThrottlerStorage` interface. Owns its TTL timers so `reset()` can cancel
 * every pending timer before clearing records: a timer can never fire against
 * a record that no longer exists, and each timer callback additionally guards
 * against a missing record. Mirrors the @nestjs/throttler 6.5.0 record
 * semantics (expiration refresh, block window, hit decrement).
 */
@Injectable()
export class ThrottlerStorage
  implements ThrottlerStorageContract, OnApplicationShutdown
{
  private readonly records = new Map<string, ThrottlerRecord>();
  private readonly timers = new Map<string, NodeJS.Timeout[]>();

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string
  ): Promise<ThrottlerStorageRecord> {
    if (!this.timers.has(throttlerName)) {
      this.timers.set(throttlerName, []);
    }
    let record = this.records.get(key);
    if (!record) {
      record = {
        totalHits: new Map([[throttlerName, 0]]),
        expiresAt: Date.now() + ttl,
        blockExpiresAt: 0,
        isBlocked: false,
      };
      this.records.set(key, record);
    }
    let timeToExpire = this.getExpirationTime(record);
    if (timeToExpire <= 0) {
      record.expiresAt = Date.now() + ttl;
      timeToExpire = this.getExpirationTime(record);
    }
    if (!record.isBlocked) {
      this.fireHitCount(record, key, throttlerName, ttl);
    }
    const hits = record.totalHits.get(throttlerName) ?? 0;
    if (hits > limit && !record.isBlocked) {
      record.isBlocked = true;
      record.blockExpiresAt = Date.now() + blockDuration;
    }
    const timeToBlockExpire = this.getBlockExpirationTime(record);
    if (timeToBlockExpire <= 0 && record.isBlocked) {
      this.resetBlockedRequest(record, throttlerName);
      this.fireHitCount(record, key, throttlerName, ttl);
    }
    return {
      totalHits: record.totalHits.get(throttlerName) ?? 0,
      timeToExpire,
      isBlocked: record.isBlocked,
      timeToBlockExpire,
    };
  }

  reset() {
    for (const ids of this.timers.values()) {
      ids.forEach(clearTimeout);
    }
    this.timers.clear();
    this.records.clear();
  }

  onApplicationShutdown() {
    this.reset();
  }

  private getExpirationTime(record: ThrottlerRecord) {
    return Math.ceil((record.expiresAt - Date.now()) / 1000);
  }

  private getBlockExpirationTime(record: ThrottlerRecord) {
    return Math.ceil((record.blockExpiresAt - Date.now()) / 1000);
  }

  private fireHitCount(
    record: ThrottlerRecord,
    key: string,
    throttlerName: string,
    ttl: number
  ) {
    record.totalHits.set(
      throttlerName,
      (record.totalHits.get(throttlerName) ?? 0) + 1
    );
    this.setExpirationTime(key, ttl, throttlerName);
  }

  private setExpirationTime(
    key: string,
    ttlMilliseconds: number,
    throttlerName: string
  ) {
    const timeoutId = setTimeout(() => {
      const record = this.records.get(key);
      if (record) {
        record.totalHits.set(
          throttlerName,
          Math.max(0, (record.totalHits.get(throttlerName) ?? 0) - 1)
        );
      }
      this.removeTimer(throttlerName, timeoutId);
    }, ttlMilliseconds);
    this.timers.get(throttlerName)?.push(timeoutId);
  }

  private resetBlockedRequest(record: ThrottlerRecord, throttlerName: string) {
    record.isBlocked = false;
    record.totalHits.set(throttlerName, 0);
    this.timers.get(throttlerName)?.forEach(clearTimeout);
    this.timers.set(throttlerName, []);
  }

  private removeTimer(throttlerName: string, timeoutId: NodeJS.Timeout) {
    const ids = this.timers.get(throttlerName);
    if (ids) {
      this.timers.set(
        throttlerName,
        ids.filter(id => id !== timeoutId)
      );
    }
  }
}

@Injectable()
class CustomOptionsFactory implements ThrottlerOptionsFactory {
  constructor(
    private readonly config: Config,
    private readonly storage: ThrottlerStorage
  ) {}

  createThrottlerOptions() {
    const options: ThrottlerModuleOptions = {
      throttlers: Object.entries(this.config.throttle.throttlers).map(
        ([name, config]) => ({
          name,
          ...config,
        })
      ),
      storage: this.storage,
    };

    return options;
  }
}

@Injectable()
export class CloudThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: Config
  ) {
    super(options, storageService, reflector);
  }

  override getRequestResponse(context: ExecutionContext): {
    req: Request;
    res: Response;
  } {
    return getRequestResponseFromContext(context) as any;
  }

  override getTracker(req: Request): Promise<string> {
    // throttler prefix make the key in store recognizable
    return Promise.resolve(`throttler:${getRequestTrackerId(req)}`);
  }

  override generateKey(
    context: ExecutionContext,
    tracker: string,
    throttler: string
  ) {
    if (tracker.endsWith(';custom')) {
      return `${tracker};${throttler}:${context.getClass().name}.${context.getHandler().name}`;
    }

    return `${tracker};${throttler}`;
  }

  override async handleRequest(request: ThrottlerRequest) {
    const {
      context,
      throttler: throttlerOptions,
      ttl,
      blockDuration,
    } = request;

    let limit = request.limit;

    // give it 'default' if no throttler is specified,
    // so the unauthenticated users visits will always hit default throttler
    // authenticated users will directly bypass unprotected APIs in [CloudThrottlerGuard.canActivate]
    const throttler = this.getSpecifiedThrottler(context) ?? 'default';

    // by pass unmatched throttlers
    if (throttlerOptions.name !== throttler) {
      return true;
    }

    const { req, res } = this.getRequestResponse(context);
    const ignoreUserAgents =
      throttlerOptions.ignoreUserAgents ?? this.commonOptions.ignoreUserAgents;
    if (Array.isArray(ignoreUserAgents)) {
      for (const pattern of ignoreUserAgents) {
        const ua = req.headers['user-agent'];
        if (ua && pattern.test(ua)) {
          return true;
        }
      }
    }

    let tracker = await this.getTracker(req);

    // custom limit or ttl APIs will be treated standalone
    if (limit !== throttlerOptions.limit || ttl !== throttlerOptions.ttl) {
      tracker += ';custom';
    }

    const key = this.generateKey(
      context,
      tracker,
      throttlerOptions.name ?? 'default'
    );
    const { timeToExpire, totalHits, isBlocked, timeToBlockExpire } =
      await this.storageService.increment(key, ttl, limit, blockDuration, key);

    if (isBlocked) {
      res.header('Retry-After', timeToBlockExpire.toString());
      await this.throwThrottlingException(context, {
        limit,
        ttl,
        key,
        tracker,
        totalHits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire,
      });
    }

    res.header(`${this.headerPrefix}-Limit`, limit.toString());
    res.header(
      `${this.headerPrefix}-Remaining`,
      (limit - totalHits).toString()
    );
    res.header(`${this.headerPrefix}-Reset`, timeToExpire.toString());
    return true;
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.throttle.enabled) {
      return true;
    }

    const { req } = this.getRequestResponse(context);

    const throttler = this.getSpecifiedThrottler(context);

    // if user is logged in, bypass non-protected handlers
    if (!throttler && req.session?.user) {
      return true;
    }

    return super.canActivate(context);
  }

  getSpecifiedThrottler(context: ExecutionContext): ThrottlerType | undefined {
    const throttler = this.reflector.getAllAndOverride<Throttlers | undefined>(
      THROTTLER_PROTECTED,
      [context.getHandler(), context.getClass()]
    );

    return throttler === 'authenticated' ? undefined : throttler;
  }
}

@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useClass: CustomOptionsFactory,
    }),
  ],
  providers: [ThrottlerStorage, CloudThrottlerGuard],
  exports: [ThrottlerStorage, CloudThrottlerGuard],
})
export class RateLimiterModule {}

export * from './decorators';
