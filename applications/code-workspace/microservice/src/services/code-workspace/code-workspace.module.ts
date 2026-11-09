import { Module } from '@nestjs/common';
import { CodeWorkspace } from '@quarry/shared/domain';
import { DurableModule } from '@quarry/platform-kernel/infra/durable';
import { IdentityModule } from '@quarry/platform-kernel/services/Identity/identity.module';
import { LibraryModule } from '@quarry/platform-kernel/services/Library/library.module';
import { CatalogClient, ForgeClient, IdentityClient } from '@quarry/platform-kernel/microservice/clients';
import { CodeWorkspaceService } from './code-workspace.service';
import { CodeWorkspaceRepository } from './code-workspace.repository';
import { CIService } from '../ci/ci.service';
import { PublisherService } from '../publisher/publisher.service';
import { CheckRunRepository } from '../ci/check-run.repository';
import { GitRepos } from '../git/git-repos';
import { GitService } from '../git/git.service';
import { CodeWorkspaceWorkerClient } from './worker/code-workspace-worker.client';

import CI = CodeWorkspace.CI;

/**
 * Code Workspaces: the resource, its bare Git repository, Git
 * over HTTP (git.controller), and sessions — which the code workspace worker runs; the
 * server checks permissions and calls its API (CodeWorkspaceWorkerClient) — and
 * checks, queued for every pushed branch head (CIService). Datasets are Catalog's (CatalogClient), recipes
 * Forge's (ForgeClient), tokens the main server's (IdentityClient).
 * Providers only; the controllers are registered by microservice.module.
 */
@Module({
    imports:   [IdentityModule, LibraryModule, DurableModule.registerQueue(CI.DurableQueue.RunCheck)],
    providers: [CodeWorkspaceService, CodeWorkspaceRepository, CheckRunRepository, CIService, PublisherService, GitService, GitRepos, CodeWorkspaceWorkerClient, CatalogClient, ForgeClient, IdentityClient],
    exports:   [CodeWorkspaceService, GitService],
})
export class CodeWorkspaceModule {}
