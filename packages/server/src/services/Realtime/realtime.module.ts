import { Global, Module } from '@nestjs/common';
import { TokenVerifier } from '@quarry/platform-server/auth/token-verifier';
import { IdentityModule } from '@quarry/platform-server/services/Identity/identity.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

/** Global: any service may emit events. The gateway is the browser's /socket. */
@Global()
@Module({
    imports:   [IdentityModule],
    providers: [RealtimeGateway, RealtimeService, TokenVerifier],
    exports:   [RealtimeService],
})
export class RealtimeModule {}
