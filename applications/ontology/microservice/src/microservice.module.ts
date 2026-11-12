import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthGuard }                 from '@quarry/platform-kernel/auth/auth.guard';
import { RequestIdentityMiddleware } from '@quarry/platform-kernel/auth/request-identity';
import { TokenVerifier }             from '@quarry/platform-kernel/auth/token-verifier';
import { HealthController }          from '@quarry/platform-kernel/http/health.controller';
import { InfraModule }               from '@quarry/platform-kernel/infra/infra.module';
import { DurableModule }             from '@quarry/platform-kernel/infra/durable';
import { MicroserviceCallsModule }   from '@quarry/platform-kernel/microservice/microservice-calls.module';
import { AuditModule }               from '@quarry/platform-kernel/services/Audit/audit.module';
import { AuditRelayMiddleware }      from '@quarry/platform-kernel/services/Audit/audit-relay';
import { IdentityModule }            from '@quarry/platform-kernel/services/Identity/identity.module';
import { LibraryModule }             from '@quarry/platform-kernel/services/Library/library.module';
import { GatekeeperModule }          from '@quarry/platform-kernel/services/Gatekeeper/gatekeeper.module';
import { RequestMemoMiddleware }     from '@quarry/platform-kernel/services/Gatekeeper/request-memo';
import { RealtimeModule }            from '@quarry/platform-kernel/services/Realtime/realtime.module';
import { ObjectTypeController }      from '@quarry/ontology-microservice/services/object-type/controllers/http.controller';
import { ObjectTypeModule }          from '@quarry/ontology-microservice/services/object-type/object-type.module';
import { LinkTypeController }        from '@quarry/ontology-microservice/services/link-type/controllers/http.controller';
import { LinkTypeModule }            from '@quarry/ontology-microservice/services/link-type/link-type.module';

/**
 * The Ontology service (docs/design/ontology.md): object types and link types, the type layer on top of
 * datasets, in a process of its own on its own database login. Dataset schemas are Catalog's, through its
 * calls; lineage is the kernel's Library. Browsers reach it through the main server's proxy (`/api/ontology/…`).
 */
@Module({
    imports: [
        InfraModule,
        DurableModule.forRoot(),
        MicroserviceCallsModule.forRoot({ service: 'ontology' }),
        RealtimeModule,
        AuditModule,
        IdentityModule,
        LibraryModule,
        GatekeeperModule,
        ObjectTypeModule,
        LinkTypeModule,
    ],
    controllers: [
        HealthController,
        ObjectTypeController,
        LinkTypeController,
    ],
    providers: [
        TokenVerifier,
        { provide: APP_GUARD, useClass: AuthGuard },
    ],
})
export class OntologyMicroserviceModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(RequestMemoMiddleware, RequestIdentityMiddleware, AuditRelayMiddleware).forRoutes('*');
    }
}
