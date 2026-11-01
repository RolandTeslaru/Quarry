import { Global, Module } from '@nestjs/common';
import { GatekeeperService } from './gatekeeper.service';
import { GrantRepository } from './grant.repository';

/** Global: every gated service injects GatekeeperService. */
@Global()
@Module({
    providers: [GatekeeperService, GrantRepository],
    exports:   [GatekeeperService],
})
export class GatekeeperModule {}
