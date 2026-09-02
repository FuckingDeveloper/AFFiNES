import { Module } from '@nestjs/common';

import { AuditModule } from '../../core/audit';
import { AuthModule } from '../../core/auth';
import { PermissionModule } from '../../core/permission';
import { WorkspaceModule } from '../../core/workspaces';
import { IntegrationController } from './controller';
import { IntegrationJob } from './job';
import { DevelopmentLinkService } from './link-service';
import { CiProviderRegistry } from './providers/ci';
import { JenkinsCiProvider } from './providers/jenkins';
import { GitLabScmProvider, ScmProviderRegistry } from './providers';
import {
  DevelopmentInfoResolver,
  IntegrationMutationResolver,
  WorkspaceIntegrationResolver,
} from './resolver';
import { IntegrationConnectionService } from './service';
import { TrackWorkModule } from '../trackwork';

@Module({
  imports: [
    AuditModule,
    AuthModule,
    PermissionModule,
    WorkspaceModule,
    TrackWorkModule,
  ],
  providers: [
    GitLabScmProvider,
    ScmProviderRegistry,
    JenkinsCiProvider,
    CiProviderRegistry,
    IntegrationConnectionService,
    DevelopmentLinkService,
    IntegrationJob,
    WorkspaceIntegrationResolver,
    IntegrationMutationResolver,
    DevelopmentInfoResolver,
  ],
  controllers: [IntegrationController],
})
export class IntegrationModule {}
