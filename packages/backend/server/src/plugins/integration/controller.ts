import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';

import { Throttle } from '../../base/throttler';
import { IntegrationConnectionService } from './service';
import type { ScmProviderType } from './types';

@Controller('/api/integrations')
export class IntegrationController {
  constructor(private readonly connections: IntegrationConnectionService) {}

  @Post('/gitlab/webhook/:connectionId')
  @HttpCode(200)
  @Throttle('default', { limit: 60, ttl: 60_000 })
  async gitlabWebhook(
    @Param('connectionId') connectionId: string,
    @Headers() headers: Record<string, unknown>,
    @Body() body: unknown
  ) {
    const result = await this.connections.acceptScmWebhook({
      connectionId,
      provider: 'gitlab' as ScmProviderType,
      headers,
      body,
    });

    return { accepted: result.accepted };
  }
}
