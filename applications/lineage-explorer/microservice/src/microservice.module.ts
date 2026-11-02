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
import { ExplorationController } from '@quarry/lineage-explorer-microservice/services/exploration/controllers/http.controller';
import { ExplorationModule } from '@quarry/lineage-explorer-microservice/services/exploration/exploration.module';

/**
 * The Lineage Explorer service (docs/design/lineage.md): saved explorations, in a process of its own on
 * its own database login. The platform is the kernel's modules, in-process, and lineage is the kernel's
 * Library. Browsers reach it through the main server's proxy (`/api/lineage-explorer/…`).
 */
@Module({
    imports: [
        InfraModule,
        DurableQueueModule.forRoot(),
        MicroserviceCallsModule.forRoot({ service: 'lineage-explorer' }),
        RealtimeModule,
        AuditModule,
        IdentityModule,
        LibraryModule,
        GatekeeperModule,
        ExplorationModule,
    ],
    controllers: [
        HealthController,
        ExplorationController,
    ],
    providers: [
        TokenVerifier,
        { provide: APP_GUARD, useClass: AuthGuard },
    ],
})
export class LineageExplorerMicroserviceModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(RequestMemoMiddleware, RequestIdentityMiddleware, AuditRelayMiddleware).forRoutes('*');
    }
}
