import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@quarry/platform-kernel/auth/auth.guard';
import { RequestIdentityMiddleware } from '@quarry/platform-kernel/auth/request-identity';
import { TokenVerifier } from '@quarry/platform-kernel/auth/token-verifier';
import { HealthController } from '@quarry/platform-kernel/http/health.controller';
import { InfraModule } from '@quarry/platform-kernel/infra/infra.module';
import { DurableQueueModule } from '@quarry/platform-kernel/infra/durable-queue';
import { MicroserviceCallsModule } from '@quarry/platform-kernel/microservice/microservice-calls.module';
import { AuditModule } from '@quarry/platform-kernel/services/Audit/audit.module';
import { AuditRelayMiddleware } from '@quarry/platform-kernel/services/Audit/audit-relay';
import { IdentityModule } from '@quarry/platform-kernel/services/Identity/identity.module';
import { LibraryModule } from '@quarry/platform-kernel/services/Library/library.module';
import { GatekeeperModule } from '@quarry/platform-kernel/services/Gatekeeper/gatekeeper.module';
import { RequestMemoMiddleware } from '@quarry/platform-kernel/services/Gatekeeper/request-memo';
import { RealtimeModule } from '@quarry/platform-kernel/services/Realtime/realtime.module';
import { SourceModule } from '@quarry/data-connection-server/source/source.module';
import { SourceController } from '@quarry/data-connection-server/source/controllers/http.controller';
import { SyncModule } from '@quarry/data-connection-server/sync/sync.module';
import { SyncController } from '@quarry/data-connection-server/sync/controllers/http.controller';
import { SyncInternalController } from '@quarry/data-connection-server/sync/controllers/internal-http.controller';
import { SyncRunModule } from '@quarry/data-connection-server/sync-run/sync-run.module';
import { SyncRunController } from '@quarry/data-connection-server/sync-run/controllers/http.controller';
import { SyncRunInternalController } from '@quarry/data-connection-server/sync-run/controllers/internal-http.controller';

/**
 * The Data Connection service (docs/design/architecture-split.md, phase 2): sources, syncs and their
 * runs, in a process of its own on its own database login. The platform is the kernel's modules,
 * in-process; output datasets and credentials are Catalog's and Keychain's, through microservice calls.
 * Browsers reach it through the main server's proxy (`/api/data-connection/…`); its worker and the
 * system worker call its /internal endpoints directly.
 */
@Module({
    imports: [
        InfraModule,
        DurableQueueModule.forRoot(),
        MicroserviceCallsModule.forRoot({ service: 'data-connection' }),
        RealtimeModule,
        AuditModule,
        IdentityModule,
        LibraryModule,
        GatekeeperModule,
        SourceModule,
        SyncModule,
        SyncRunModule,
    ],
    controllers: [
        HealthController,
        SourceController,
        SyncController,
        SyncRunController,
        // /api/internal/… — service token only, for the Data Connection worker and the system worker
        SyncRunInternalController,
        SyncInternalController,
    ],
    providers: [
        TokenVerifier,
        { provide: APP_GUARD, useClass: AuthGuard },
    ],
})
export class DataConnectionMicroserviceModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(RequestMemoMiddleware, RequestIdentityMiddleware, AuditRelayMiddleware).forRoutes('*');
    }
}
