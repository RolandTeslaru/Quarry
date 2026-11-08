import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@quarry/platform-kernel/auth/auth.guard';
import { RequestIdentityMiddleware } from '@quarry/platform-kernel/auth/request-identity';
import { TokenVerifier } from '@quarry/platform-kernel/auth/token-verifier';
import { HealthController } from '@quarry/platform-kernel/http/health.controller';
import { InfraModule } from '@quarry/platform-kernel/infra/infra.module';
import { DurableQueueInternalController, DurableQueueModule } from '@quarry/platform-kernel/infra/durable';
import { MicroserviceCallsModule } from '@quarry/platform-kernel/microservice/microservice-calls.module';
import { AuditModule } from '@quarry/platform-kernel/services/Audit/audit.module';
import { AuditRelayMiddleware } from '@quarry/platform-kernel/services/Audit/audit-relay';
import { IdentityModule } from '@quarry/platform-kernel/services/Identity/identity.module';
import { LibraryModule } from '@quarry/platform-kernel/services/Library/library.module';
import { GatekeeperModule } from '@quarry/platform-kernel/services/Gatekeeper/gatekeeper.module';
import { RequestMemoMiddleware } from '@quarry/platform-kernel/services/Gatekeeper/request-memo';
import { RealtimeModule } from '@quarry/platform-kernel/services/Realtime/realtime.module';
import { CodeWorkspaceModule } from '@quarry/code-workspace-microservice/services/code-workspace/code-workspace.module';
import { CodeWorkspaceController } from '@quarry/code-workspace-microservice/services/code-workspace/controllers/http.controller';
import { CodeWorkspaceInternalController } from '@quarry/code-workspace-microservice/services/code-workspace/controllers/internal-http.controller';
import { GitController } from '@quarry/code-workspace-microservice/services/git/git.controller';

/**
 * The Code Workspaces service (docs/design/architecture-split.md, phase 4): workspaces, their Git
 * repositories, sessions and check runs, in a process of its own on its own database login. The platform
 * is the kernel's modules, in-process; datasets are Catalog's, recipes Forge's and tokens the main
 * server's, through microservice calls. Browsers and sessions reach it through the main server's proxy
 * (`/api/code-workspaces/…`, `/api/git/…`); its worker calls `/api/internal/…` directly.
 */
@Module({
    imports: [
        InfraModule,
        DurableQueueModule.forRoot(),
        MicroserviceCallsModule.forRoot({ service: 'code-workspace' }),
        RealtimeModule,
        AuditModule,
        IdentityModule,
        LibraryModule,
        GatekeeperModule,
        CodeWorkspaceModule,
    ],
    controllers: [
        HealthController,
        CodeWorkspaceController,
        // /api/git/… — Git over HTTP, for sessions and check runs
        GitController,
        // /api/internal/… — service token only: the code workspace worker's, the system worker's check sweep
        CodeWorkspaceInternalController,
        // and the system worker's sweep of Code Workspaces' outbox (run-check)
        DurableQueueInternalController,
    ],
    providers: [
        TokenVerifier,
        { provide: APP_GUARD, useClass: AuthGuard },
    ],
})
export class CodeWorkspaceMicroserviceModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(RequestMemoMiddleware, RequestIdentityMiddleware, AuditRelayMiddleware).forRoutes('*');
    }
}
