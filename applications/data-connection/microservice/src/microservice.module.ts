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
import { DataConnectionModule } from '@quarry/data-connection-microservice/services/data-connection/data-connection.module';
import { DataConnectionRuntimeController } from '@quarry/data-connection-microservice/services/data-connection/controllers/runtime-http.controller';
import { SourceModule } from '@quarry/data-connection-microservice/services/source/source.module';
import { SourceController } from '@quarry/data-connection-microservice/services/source/controllers/http.controller';
import { SyncModule } from '@quarry/data-connection-microservice/services/sync/sync.module';
import { SyncController } from '@quarry/data-connection-microservice/services/sync/controllers/http.controller';

/**
 * The Data Connection service (docs/design/architecture-split.md, phase 2): sources and syncs, in a
 * process of its own on its own database login. A sync runs as a Forge build: this service publishes its
 * recipe, and a job's runtime gets its connection here. The platform is the kernel's modules, in-process;
 * output datasets, credentials and recipes are Catalog's, Keychain's and Forge's, through microservice
 * calls. Browsers and job runtimes reach it through the main server's proxy (`/api/data-connection/…`).
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
        DataConnectionModule,
    ],
    controllers: [
        HealthController,
        SourceController,
        // /api/data-connection/jobs/… for a running sync job's runtime
        DataConnectionRuntimeController,
        SyncController,
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
