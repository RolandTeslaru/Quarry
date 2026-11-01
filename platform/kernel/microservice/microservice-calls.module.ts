import { type DynamicModule, Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import type { Foundations } from '@quarry/shared/domain';
import { TokenVerifier } from '@quarry/platform-kernel/auth/token-verifier';
import { requireEnv } from '@quarry/platform-kernel/db/table';
import { IdentityModule } from '@quarry/platform-kernel/services/Identity/identity.module';
import { MicroserviceCallReceiver } from './microservice-call-receiver';
import { MicroserviceCaller } from './microservice-caller';
import { SERVICE_NAME, ServiceTokens } from './service-tokens';

/**
 * Microservice calls for this process (docs/design/architecture-split.md §8): its name, its token, the caller
 * the clients use, the receiver `@MicroserviceCall` handlers use. Once per app, global; each module then
 * provides the clients it uses (`CatalogClient`, …).
 */
@Module({})
export class MicroserviceCallsModule {

    public static forRoot(options: { service: Foundations.MicroserviceCall.Microservice }): DynamicModule {
        return {
            module:    MicroserviceCallsModule,
            global:    true,
            imports:   [IdentityModule],
            providers: [{ provide: SERVICE_NAME, useValue: options.service }, ServiceTokens, MicroserviceCaller, MicroserviceCallReceiver, TokenVerifier],
            exports:   [SERVICE_NAME, ServiceTokens, MicroserviceCaller, MicroserviceCallReceiver],
        };
    }
}

/** Serves this app's `@MicroserviceCall` handlers on NATS, in its service's queue group: one instance takes each call. Before `listen`. */
export async function connectMicroserviceCalls(app: INestApplication, service: Foundations.MicroserviceCall.Microservice): Promise<void> {
    app.connectMicroservice<MicroserviceOptions>({
        transport: Transport.NATS,
        options:   { servers: [requireEnv('NATS_URL')], queue: service },
    });

    await app.startAllMicroservices();
}
