import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@quarry/platform-kernel/auth/auth.guard';
import { RequestIdentityMiddleware } from '@quarry/platform-kernel/auth/request-identity';
import { TokenVerifier } from '@quarry/platform-kernel/auth/token-verifier';
import { HealthController } from '@quarry/platform-kernel/http/health.controller';
import { InfraModule } from '@quarry/platform-kernel/infra/infra.module';
import { DurableQueueInternalController, DurableModule } from '@quarry/platform-kernel/infra/durable';
import { MicroserviceCallsModule } from '@quarry/platform-kernel/microservice/microservice-calls.module';
import { AuditModule } from '@quarry/platform-kernel/services/Audit/audit.module';
import { AuditRelayMiddleware } from '@quarry/platform-kernel/services/Audit/audit-relay';
import { IdentityModule } from '@quarry/platform-kernel/services/Identity/identity.module';
import { LibraryModule } from '@quarry/platform-kernel/services/Library/library.module';
import { GatekeeperModule } from '@quarry/platform-kernel/services/Gatekeeper/gatekeeper.module';
import { RequestMemoMiddleware } from '@quarry/platform-kernel/services/Gatekeeper/request-memo';
import { RealtimeModule } from '@quarry/platform-kernel/services/Realtime/realtime.module';
import { ForgeModule } from '@quarry/forge-microservice/services/forge/forge.module';
import { ForgeController } from '@quarry/forge-microservice/services/forge/controllers/http.controller';
import { ForgeAgentController } from '@quarry/forge-microservice/services/forge/controllers/agent-http.controller';
import { JobController } from '@quarry/forge-microservice/services/job/controllers/http.controller';
import { JobRuntimeController } from '@quarry/forge-microservice/services/job/controllers/runtime-http.controller';
import { ForgeMicroserviceController } from '@quarry/forge-microservice/microservice.controller';

/**
 * The Forge service (docs/design/architecture-split.md, phase 3): recipes, builds and their jobs, in a
 * process of its own on its own database login. The platform is the kernel's modules, in-process;
 * datasets are Catalog's and job tokens the main server's, through microservice calls. Browsers reach
 * it through the main server's proxy (`/api/forge/…`); ForgeAgents call `/api/forge-agent/…` directly.
 */
@Module({
    imports: [
        InfraModule,
        DurableModule.forRoot(),
        MicroserviceCallsModule.forRoot({ service: 'forge' }),
        RealtimeModule,
        AuditModule,
        IdentityModule,
        LibraryModule,
        GatekeeperModule,
        ForgeModule,
    ],
    controllers: [
        HealthController,
        ForgeController,
        JobController,
        // /api/forge/jobs/… for a running job's runtime
        JobRuntimeController,
        // /api/forge-agent/… — the ForgeAgent token only
        ForgeAgentController,
        ForgeMicroserviceController,
        // /api/internal/… — service token only: the system worker's sweep of Forge's outbox (run-job)
        DurableQueueInternalController,
    ],
    providers: [
        TokenVerifier,
        { provide: APP_GUARD, useClass: AuthGuard },
    ],
})
export class ForgeMicroserviceModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(RequestMemoMiddleware, RequestIdentityMiddleware, AuditRelayMiddleware).forRoutes('*');
    }
}
