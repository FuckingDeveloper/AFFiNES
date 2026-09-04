import { Module } from '@nestjs/common';

import { AuditModule } from '../../core/audit';
import { AuthModule } from '../../core/auth';
import { PermissionModule } from '../../core/permission';
import { QuorumShareExportController } from './quorum.controller';
import { QuorumShareExportService } from './quorum.service';
import { TrackWorkResolver } from './resolver';
import { TrackWorkRegistryService } from './service';
import { TrackWorkWorkflowResolver } from './workflow.resolver';
import { TrackWorkWorkflowService } from './workflow.service';

@Module({
  imports: [AuditModule, AuthModule, PermissionModule],
  providers: [
    TrackWorkRegistryService,
    TrackWorkResolver,
    TrackWorkWorkflowService,
    TrackWorkWorkflowResolver,
    QuorumShareExportService,
  ],
  controllers: [QuorumShareExportController],
  exports: [TrackWorkRegistryService, TrackWorkWorkflowService],
})
export class TrackWorkModule {}
