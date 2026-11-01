import { Module } from '@nestjs/common';
import { TokenVerifier } from '@quarry/platform-kernel/auth/token-verifier';
import { ForgeClient } from '@quarry/platform-kernel/microservice/clients';
import { IdentityModule } from '@quarry/platform-kernel/services/Identity/identity.module';
import { RealtimeGateway } from './realtime.gateway';

/** The browsers' /socket, in the main server: one connection each, relaying what every service emits (kernel RealtimeModule). */
@Module({
    imports:   [IdentityModule],
    providers: [RealtimeGateway, TokenVerifier, ForgeClient],
})
export class RealtimeGatewayModule {}
