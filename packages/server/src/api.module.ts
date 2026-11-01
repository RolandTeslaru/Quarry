import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@quarry/platform-server/auth/auth.guard';
import { TokenVerifier } from '@quarry/platform-server/auth/token-verifier';
import { HealthController } from '@quarry/platform-server/http/health.controller';
import { InfraModule } from '@quarry/platform-server/infra/infra.module';
import { DurableQueueInternalController, DurableQueueModule } from '@quarry/platform-server/infra/durable-queue';
import { IdentityModule } from '@quarry/platform-server/services/Identity/identity.module';
import { MeController } from '@/services/Identity/me.controller';
import { UsersController } from '@/services/Identity/users.controller';
import { LibraryModule } from '@quarry/platform-server/services/Library/library.module';
import { LibraryController } from '@/services/Library/library.controller';
import { GatekeeperModule } from '@quarry/platform-server/services/Gatekeeper/gatekeeper.module';
import { GrantsController } from '@/services/Gatekeeper/grants.controller';
import { RequestMemoMiddleware } from '@quarry/platform-server/services/Gatekeeper/request-memo';
import { KeychainModule } from '@/services/Keychain/keychain.module';
import { KeychainController } from '@/services/Keychain/keychain.controller';
import { RealtimeModule } from '@/services/Realtime/realtime.module';
import { AuditModule } from '@quarry/platform-server/services/Audit/audit.module';
import { AuditController } from '@/services/Audit/audit.controller';
import { AuditInternalController } from '@/services/Audit/audit.internal.controller';
import { AuditRelayMiddleware } from '@quarry/platform-server/services/Audit/audit-relay';

/**
 * The main server — the platform (docs/design/architecture-split.md): identity, Library, Gatekeeper's
 * grants, Keychain, audit's store, the realtime gateway, and migrations; Catalog's routes are forwarded
 * to the Catalog service (api.ts). Phase 1 of the split: Data Connection, Code Workspaces and Forge are
 * out until they come back as services of their own. It never consumes a queue, opens a source, or runs DuckDB.
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
    ],
    controllers: [
        HealthController,
        MeController,
        UsersController,
        LibraryController,
        GrantsController,
        KeychainController,
        AuditController,
        // /api/internal/… — service token only, for the workers
        DurableQueueInternalController,
        AuditInternalController,
    ],
    providers: [
        TokenVerifier,
        { provide: APP_GUARD, useClass: AuthGuard },
    ],
})
export class ApiModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(RequestMemoMiddleware, AuditRelayMiddleware).forRoutes('*');
    }
}
