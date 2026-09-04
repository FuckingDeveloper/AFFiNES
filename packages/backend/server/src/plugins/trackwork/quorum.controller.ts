import { Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { Throttle } from '../../base';
import { Admin } from '../../core/common';
import { QuorumShareExportService } from './quorum.service';

@Controller('/api/admin/trackwork/quorum')
export class QuorumShareExportController {
  constructor(private readonly service: QuorumShareExportService) {}

  @Post('/shares/export')
  @Admin()
  @Throttle('strict')
  async exportShares(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Pragma', 'no-cache');
    const sessionUser = req.session?.user;
    return this.service.exportShares({
      id: sessionUser?.id ?? '',
      email: sessionUser?.email ?? '',
    });
  }
}
