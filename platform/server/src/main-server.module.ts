import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@quarry/platform-kernel/auth/auth.guard';
import { TokenVerifier } from '@quarry/platform-kernel/auth/token-verifier';
import { HealthController } from '@quarry/platform-kernel/http/health.controller';
import { InfraModule } from '@quarry/platform-kernel/infra/infra.module';
import { DurableQueueInternalController, DurableQueueModule } from '@quarry/platform-kernel/infra/durable';
import { IdentityModule } from '@quarry/platform-kernel/services/Identity/identity.module';
import { IdentityController } from '@/services/Identity/controllers/http.controller';
import { LibraryModule } from '@quarry/platform-kernel/services/Library/library.module';
import { LibraryController } from '@/services/Library/controllers/http.controller';
import { GatekeeperModule } from '@quarry/platform-kernel/services/Gatekeeper/gatekeeper.module';
import { GrantsController } from '@/services/Gatekeeper/controllers/http.controller';
import { RequestMemoMiddleware } from '@quarry/platform-kernel/services/Gatekeeper/request-memo';
import { KeychainModule } from '@/services/Keychain/keychain.module';
import { KeychainController } from '@/services/Keychain/controllers/http.controller';
import { RealtimeModule } from '@quarry/platform-kernel/services/Realtime/realtime.module';
import { RealtimeGatewayModule } from '@/services/Realtime/realtime-gateway.module';
import { AuditModule } from '@quarry/platform-kernel/services/Audit/audit.module';
import { AuditController } from '@/services/Audit/controllers/http.controller';
import { AuditInternalController } from '@/services/Audit/controllers/internal-http.controller';
import { AuditRelayMiddleware } from '@quarry/platform-kernel/services/Audit/audit-relay';
import { RequestIdentityMiddleware } from '@quarry/platform-kernel/auth/request-identity';
import { MicroserviceCallsModule } from '@quarry/platform-kernel/microservice/microservice-calls.module';
import { ServiceTokensController } from '@/auth/service-tokens.controller';
import { SessionTokens } from '@/auth/session-tokens';
import { IdentityMicroserviceCallsController } from '@/services/Identity/controllers/microservice-calls.controller';
import { KeychainMicroserviceCallsController } from '@/services/Keychain/controllers/microservice-calls.controller';

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
        MicroserviceCallsModule.forRoot({ service: 'main' }),
        RealtimeModule,
        RealtimeGatewayModule,
        AuditModule,
        IdentityModule,
        LibraryModule,
        GatekeeperModule,
        KeychainModule,
    ],
    controllers: [
        HealthController,
        IdentityController,
        LibraryController,
        GrantsController,
        KeychainController,
        AuditController,
        // /api/internal/… — service token only, for the workers
        DurableQueueInternalController,
        AuditInternalController,
        ServiceTokensController,
        // microservice calls (NATS) — no HTTP route
        IdentityMicroserviceCallsController,
        KeychainMicroserviceCallsController,
    ],
    providers: [
        TokenVerifier,
        SessionTokens,
        { provide: APP_GUARD, useClass: AuthGuard },
    ],
})
export class MainServerModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(RequestMemoMiddleware, RequestIdentityMiddleware, AuditRelayMiddleware).forRoutes('*');
    }
}
