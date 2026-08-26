import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { SkipThrottle } from './base';
import { CacheRedis } from './base/redis';
import { Public } from './core/auth';

@Controller()
export class AppController {
  constructor(
    private readonly db: PrismaClient,
    private readonly redis: CacheRedis
  ) {}

  @SkipThrottle()
  @Public()
  @Get('/info')
  info() {
    return {
      compatibility: env.version,
      message: `TrackWork ${env.version} Server`,
      type: env.DEPLOYMENT_TYPE,
      flavor: env.FLAVOR,
    };
  }

  @SkipThrottle()
  @Public()
  @Get('/health/live')
  live() {
    return { status: 'ok' };
  }

  @SkipThrottle()
  @Public()
  @Get(['/health', '/health/ready'])
  async ready() {
    try {
      await Promise.all([this.db.$queryRaw`SELECT 1`, this.redis.ping()]);
      return {
        status: 'ok',
        services: {
          postgres: 'ok',
          redis: 'ok',
        },
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
      });
    }
  }
}
