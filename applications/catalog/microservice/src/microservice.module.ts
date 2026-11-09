import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@quarry/platform-kernel/auth/auth.guard';
import { TokenVerifier } from '@quarry/platform-kernel/auth/token-verifier';
import { HealthController } from '@quarry/platform-kernel/http/health.controller';
import { InfraModule } from '@quarry/platform-kernel/infra/infra.module';
import { DurableModule } from '@quarry/platform-kernel/infra/durable';
import { AuditModule } from '@quarry/platform-kernel/services/Audit/audit.module';
import { AuditRelayMiddleware } from '@quarry/platform-kernel/services/Audit/audit-relay';
import { IdentityModule } from '@quarry/platform-kernel/services/Identity/identity.module';
import { LibraryModule } from '@quarry/platform-kernel/services/Library/library.module';
import { GatekeeperModule } from '@quarry/platform-kernel/services/Gatekeeper/gatekeeper.module';
import { RequestMemoMiddleware } from '@quarry/platform-kernel/services/Gatekeeper/request-memo';
import { CatalogModule } from '@quarry/catalog-microservice/catalog/catalog.module';
import { TransactionModule } from '@quarry/catalog-microservice/transaction/transaction.module';
import { CatalogController } from '@quarry/catalog-microservice/catalog/controllers/http.controller';
import { CatalogInternalController } from '@quarry/catalog-microservice/catalog/controllers/internal-http.controller';
import { CatalogMicroserviceController } from '@quarry/catalog-microservice/microservice.controller';
import { RequestIdentityMiddleware } from '@quarry/platform-kernel/auth/request-identity';
import { MicroserviceCallsModule } from '@quarry/platform-kernel/microservice/microservice-calls.module';

/**
 * The Catalog service (docs/design/architecture-split.md): datasets, their storage and DuckDB, in a
 * process of its own. The platform — identity, permissions, Library rows, audit — is the shared
 * kernel's modules, in-process, on this service's own database login. Browsers reach it through the
 * main server's proxy (`/api/catalog/…`); the system worker calls its storage GC directly.
 */
@Module({
    imports: [
        InfraModule,
        DurableModule.forRoot(),
        MicroserviceCallsModule.forRoot({ service: 'catalog' }),
        AuditModule,
        IdentityModule,
        LibraryModule,
        GatekeeperModule,
        CatalogModule,
        TransactionModule,
    ],
    controllers: [
        HealthController,
        CatalogController,
        // /api/internal/… — service token only, for the system worker
        CatalogInternalController,
        // microservice calls (NATS) — no HTTP route
        CatalogMicroserviceController,
    ],
    providers: [
        TokenVerifier,
        { provide: APP_GUARD, useClass: AuthGuard },
    ],
})
export class CatalogMicroserviceModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(RequestMemoMiddleware, RequestIdentityMiddleware, AuditRelayMiddleware).forRoutes('*');
    }
}
