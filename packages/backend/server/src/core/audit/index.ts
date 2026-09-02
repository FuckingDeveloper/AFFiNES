import { Module } from '@nestjs/common';

import { AdminAuditService } from './audit.service';

@Module({
  providers: [AdminAuditService],
  exports: [AdminAuditService],
})
export class AuditModule {}

export { AdminAuditService } from './audit.service';
