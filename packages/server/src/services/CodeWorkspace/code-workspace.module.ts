import { Module } from '@nestjs/common';
import { CodeWorkspace } from '@quarry/shared/domain';
import { SessionTokens } from '@/auth/session-tokens';
import { DurableQueueModule } from '@/infra/durable-queue';
import { IdentityModule } from '@/services/Identity/identity.module';
import { LibraryModule } from '@/services/Library/library.module';
import { CodeWorkspaceService } from './code-workspace.service';
import { CodeWorkspaceRepository } from './repository/code-workspace.repository';
import { WorkspaceRepository } from './repository/workspace.repository';
import { CodeWorkspaceChecks } from './checks/code-workspace-checks';
import { CheckRunRepository } from './repository/check-run.repository';
import { GitRepositories } from './git/repositories';
import { CodeWorkspaceWorkerClient } from './worker/code-workspace-worker.client';

/**
 * Code Workspaces in the server: the resource, its bare Git repository, Git
 * over HTTP (git.controller), and sessions — which the code workspace worker runs; the
 * server checks permissions and calls its API (CodeWorkspaceWorkerClient) — and
 * checks, queued for every pushed branch head (CodeWorkspaceChecks).
 * Providers only; the controllers are registered by api.module.
 */
@Module({
    imports:   [IdentityModule, LibraryModule, DurableQueueModule.registerQueue(CodeWorkspace.DurableQueue.RunCheck)],
    providers: [CodeWorkspaceService, CodeWorkspaceRepository, WorkspaceRepository, CheckRunRepository, CodeWorkspaceChecks, GitRepositories, CodeWorkspaceWorkerClient, SessionTokens],
    exports:   [CodeWorkspaceService],
})
export class CodeWorkspaceModule {}
