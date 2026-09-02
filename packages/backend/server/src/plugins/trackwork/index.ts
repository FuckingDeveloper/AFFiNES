import { Module } from '@nestjs/common';

import { AuditModule } from '../../core/audit';
import { AuthModule } from '../../core/auth';
import { PermissionModule } from '../../core/permission';
import { TrackWorkResolver } from './resolver';
import { TrackWorkRegistryService } from './service';

@Module({
  imports: [AuditModule, AuthModule, PermissionModule],
  providers: [TrackWorkRegistryService, TrackWorkResolver],
  exports: [TrackWorkRegistryService],
})
export class TrackWorkModule {}
