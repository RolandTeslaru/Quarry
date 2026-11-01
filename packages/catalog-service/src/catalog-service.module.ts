import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@quarry/platform-server/auth/auth.guard';
import { TokenVerifier } from '@quarry/platform-server/auth/token-verifier';
import { HealthController } from '@quarry/platform-server/http/health.controller';
import { InfraModule } from '@quarry/platform-server/infra/infra.module';
import { DurableQueueModule } from '@quarry/platform-server/infra/durable-queue';
import { AuditModule } from '@quarry/platform-server/services/Audit/audit.module';
import { AuditRelayMiddleware } from '@quarry/platform-server/services/Audit/audit-relay';
import { IdentityModule } from '@quarry/platform-server/services/Identity/identity.module';
import { LibraryModule } from '@quarry/platform-server/services/Library/library.module';
import { GatekeeperModule } from '@quarry/platform-server/services/Gatekeeper/gatekeeper.module';
import { RequestMemoMiddleware } from '@quarry/platform-server/services/Gatekeeper/request-memo';
import { CatalogModule } from '@quarry/catalog-service/catalog/catalog.module';
import { CatalogController } from '@quarry/catalog-service/catalog/catalog.controller';
import { CatalogInternalController } from '@quarry/catalog-service/catalog/catalog.internal.controller';

/**
 * The Catalog service (docs/design/architecture-split.md): datasets, their storage and DuckDB, in a
 * process of its own. The platform — identity, permissions, Library rows, audit — is the shared
 * kernel's modules, in-process, on this service's own database login. Browsers reach it through the
 * main server's proxy (`/api/datasets/…`); the system worker calls its storage GC directly.
 */
@Module({
    imports: [
        InfraModule,
        DurableQueueModule.forRoot(),
        AuditModule,
        IdentityModule,
        LibraryModule,
        GatekeeperModule,
        CatalogModule,
    ],
    controllers: [
        HealthController,
        CatalogController,
        // /api/internal/… — service token only, for the system worker
        CatalogInternalController,
    ],
    providers: [
        TokenVerifier,
        { provide: APP_GUARD, useClass: AuthGuard },
    ],
})
export class CatalogServiceModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(RequestMemoMiddleware, AuditRelayMiddleware).forRoutes('*');
    }
}
