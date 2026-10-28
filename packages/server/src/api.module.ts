import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@/auth/auth.guard';
import { TokenVerifier } from '@/auth/token-verifier';
import { HealthController } from '@/http/health.controller';
import { InfraModule } from '@/infra/infra.module';
import { DurableQueueInternalController, DurableQueueModule } from '@/infra/durable-queue';
import { IdentityModule } from '@/services/Identity/identity.module';
import { MeController } from '@/services/Identity/me.controller';
import { UsersController } from '@/services/Identity/users.controller';
import { LibraryModule } from '@/services/Library/library.module';
import { LibraryController } from '@/services/Library/library.controller';
import { GatekeeperModule } from '@/services/Gatekeeper/gatekeeper.module';
import { GrantsController } from '@/services/Gatekeeper/grants.controller';
import { RequestMemoMiddleware } from '@/services/Gatekeeper/request-memo';
import { KeychainModule } from '@/services/Keychain/keychain.module';
import { KeychainController } from '@/services/Keychain/keychain.controller';
import { CatalogModule } from '@/services/Catalog/catalog.module';
import { CatalogController } from '@/services/Catalog/catalog.controller';
import { CatalogInternalController } from '@/services/Catalog/catalog.internal.controller';
import { DataConnectionModule } from '@/services/DataConnection/data-connection.module';
import { DataConnectionController } from '@/services/DataConnection/data-connection.controller';
import { DataConnectionInternalController } from '@/services/DataConnection/data-connection.internal.controller';
import { CodeWorkspaceModule } from '@/services/CodeWorkspace/code-workspace.module';
import { CodeWorkspaceController } from '@/services/CodeWorkspace/code-workspace.controller';
import { GitController } from '@/services/CodeWorkspace/git/git.controller';
import { CodeWorkspaceInternalController } from '@/services/CodeWorkspace/code-workspace.internal.controller';
import { ForgeModule } from '@/services/Forge/forge.module';
import { ForgeController } from '@/services/Forge/forge.controller';
import { ForgeAgentController } from '@/services/Forge/agent/forge-agent.controller';
import { RealtimeModule } from '@/services/Realtime/realtime.module';
import { AuditModule } from '@/services/Audit/audit.module';
import { AuditController } from '@/services/Audit/audit.controller';

/**
 * The server: every service's module + all controllers, including the
 * /internal endpoints the workers (their own packages) call. It never
 * consumes a queue, opens a source, or runs DuckDB.
 */
@Module({
    imports: [
        InfraModule,
        DurableQueueModule.forRoot(),
        RealtimeModule,
        AuditModule,
        IdentityModule,
        LibraryModule,
        GatekeeperModule,
        KeychainModule,
        CatalogModule,
        DataConnectionModule,
        CodeWorkspaceModule,
        ForgeModule,
    ],
    controllers: [
        HealthController,
        MeController,
        UsersController,
        LibraryController,
        GrantsController,
        KeychainController,
        CatalogController,
        DataConnectionController,
        CodeWorkspaceController,
        GitController,
        ForgeController,
        AuditController,
        // /api/internal/… — service token only, for the workers
        CatalogInternalController,
        DataConnectionInternalController,
        CodeWorkspaceInternalController,
        DurableQueueInternalController,
        // /api/forge-agent/… — the ForgeAgent token only
        ForgeAgentController,
    ],
    providers: [
        TokenVerifier,
        { provide: APP_GUARD, useClass: AuthGuard },
    ],
})
export class ApiModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(RequestMemoMiddleware).forRoutes('*');
    }
}
