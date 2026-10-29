import { Module } from '@nestjs/common';
import { CodeWorkspace } from '@quarry/shared/domain';
import { SessionTokens } from '@/auth/session-tokens';
import { DurableQueueModule } from '@/infra/durable-queue';
import { IdentityModule } from '@/services/Identity/identity.module';
import { LibraryModule } from '@/services/Library/library.module';
import { CatalogModule } from '@/services/Catalog/catalog.module';
import { ForgeModule } from '@/services/Forge/forge.module';
import { CodeWorkspaceService } from './code-workspace.service';
import { CodeWorkspaceRepository } from './repository/code-workspace.repository';
import { WorkspaceRepository } from './repository/workspace.repository';
import { CIService } from './ci/ci.service';
import { CheckPublisher } from './ci/check-publisher';
import { CheckRunRepository } from './repository/check-run.repository';
import { GitRepos } from './git/git-repos';
import { GitService } from './git/git.service';
import { CodeWorkspaceWorkerClient } from './worker/code-workspace-worker.client';

import CI = CodeWorkspace.CI;

/**
 * Code Workspaces in the server: the resource, its bare Git repository, Git
 * over HTTP (git.controller), and sessions — which the code workspace worker runs; the
 * server checks permissions and calls its API (CodeWorkspaceWorkerClient) — and
 * checks, queued for every pushed branch head (CIService).
 * Providers only; the controllers are registered by api.module.
 */
@Module({
    imports:   [IdentityModule, LibraryModule, CatalogModule, ForgeModule, DurableQueueModule.registerQueue(CI.DurableQueue.RunCheck)],
    providers: [CodeWorkspaceService, CodeWorkspaceRepository, WorkspaceRepository, CheckRunRepository, CIService, CheckPublisher, GitService, GitRepos, CodeWorkspaceWorkerClient, SessionTokens],
    exports:   [CodeWorkspaceService, GitService],
})
export class CodeWorkspaceModule {}
