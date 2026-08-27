import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';

import { IntegrationConnectionService } from './service';
import type { ScmProviderType } from './types';

@Controller('/api/integrations')
export class IntegrationController {
  constructor(private readonly connections: IntegrationConnectionService) {}

  @Post('/gitlab/webhook/:connectionId')
  @HttpCode(200)
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
