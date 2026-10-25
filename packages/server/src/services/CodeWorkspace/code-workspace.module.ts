import { Module } from '@nestjs/common';
import { SessionTokens } from '@/auth/session-tokens';
import { IdentityModule } from '@/services/Identity/identity.module';
import { LibraryModule } from '@/services/Library/library.module';
import { CodeWorkspaceService } from './code-workspace.service';
import { CodeWorkspaceRepository } from './code-workspace.repository';
import { GitRepositories } from './git/repositories';
import { CodeWorkspaceWorkerClient } from './worker/code-workspace-worker.client';

/**
 * Code Workspaces in the server: the resource, its bare Git repository, Git
 * over HTTP (git.controller), and sessions — which the code workspace worker runs; the
 * server checks permissions and calls its API (CodeWorkspaceWorkerClient).
 * Providers only; the controllers are registered by api.module.
 */
@Module({
    imports:   [IdentityModule, LibraryModule],
    providers: [CodeWorkspaceService, CodeWorkspaceRepository, GitRepositories, CodeWorkspaceWorkerClient, SessionTokens],
    exports:   [CodeWorkspaceService],
})
export class CodeWorkspaceModule {}
