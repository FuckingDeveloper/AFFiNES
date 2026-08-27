import { Module } from '@nestjs/common';

import { AuthModule } from '../../core/auth';
import { PermissionModule } from '../../core/permission';
import { TrackWorkResolver } from './resolver';
import { TrackWorkRegistryService } from './service';

@Module({
  imports: [AuthModule, PermissionModule],
  providers: [TrackWorkRegistryService, TrackWorkResolver],
})
export class TrackWorkModule {}
