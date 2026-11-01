import { Global, Module } from '@nestjs/common';
import { RealtimeService } from './realtime.service';

/** Global: any service may emit events (Redis pub/sub). The browsers' gateway is the main server's (RealtimeGatewayModule). */
@Global()
@Module({
    providers: [RealtimeService],
    exports:   [RealtimeService],
})
export class RealtimeModule {}
