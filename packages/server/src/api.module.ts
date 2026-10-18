import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@/auth/auth.guard';
import { HealthController } from '@/http/health.controller';
import { InfraModule } from '@/infra/infra.module';
import { IdentityModule } from '@/services/Identity/identity.module';
import { MeController } from '@/services/Identity/me.controller';
import { UsersController } from '@/services/Identity/users.controller';
import { LibraryModule } from '@/services/Library/library.module';
import { LibraryController } from '@/services/Library/library.controller';
import { GatekeeperModule } from '@/services/Gatekeeper/gatekeeper.module';
import { GrantsController } from '@/services/Gatekeeper/grants.controller';
import { RequestMemoMiddleware } from '@/services/Gatekeeper/request-memo';
import { CatalogModule } from '@/services/Catalog/catalog.module';
import { CatalogController } from '@/services/Catalog/catalog.controller';
import { DataConnectionModule } from '@/services/DataConnection/data-connection.module';
import { DataConnectionController } from '@/services/DataConnection/data-connection.controller';

/**
 * The API process: every service's API-safe module + all controllers. No
 * queue processors, no source adapters, no DuckDB.
 */
@Module({
    imports: [
        InfraModule,
        IdentityModule,
        LibraryModule,
        GatekeeperModule,
        CatalogModule,
        DataConnectionModule,
    ],
    controllers: [
        HealthController,
        MeController,
        UsersController,
        LibraryController,
        GrantsController,
        CatalogController,
        DataConnectionController,
    ],
    providers: [
        { provide: APP_GUARD, useClass: AuthGuard },
    ],
})
export class ApiModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(RequestMemoMiddleware).forRoutes('*');
    }
}
