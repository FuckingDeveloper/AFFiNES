import { Module } from '@nestjs/common';

import { AuthModule } from '../../core/auth';
import { PermissionModule } from '../../core/permission';
import { WorkspaceModule } from '../../core/workspaces';
import { IntegrationController } from './controller';
import { IntegrationJob } from './job';
import { DevelopmentLinkService } from './link-service';
import { GitLabScmProvider, ScmProviderRegistry } from './providers';
import {
  DevelopmentInfoResolver,
  IntegrationMutationResolver,
  WorkspaceIntegrationResolver,
} from './resolver';
import { IntegrationConnectionService } from './service';

@Module({
  imports: [AuthModule, PermissionModule, WorkspaceModule],
  providers: [
    GitLabScmProvider,
    ScmProviderRegistry,
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
