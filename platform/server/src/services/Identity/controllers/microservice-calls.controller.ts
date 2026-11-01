import { Controller } from '@nestjs/common';
import { Identity } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { MicroserviceCall } from '@quarry/platform-kernel/microservice/microservice-call.decorator';
import { MicroserviceCallReceiver } from '@quarry/platform-kernel/microservice/microservice-call-receiver';
import { SESSION_TOKEN_TTL_MS, SessionTokens } from '@/auth/session-tokens';

import Calls = Identity.Microservice;

/** Identity's microservice calls: the main server alone mints users' tokens (docs/design/architecture-split.md §8). */
@Controller()
export class IdentityMicroserviceCallsController {

    constructor(
        readonly microserviceCalls: MicroserviceCallReceiver,
        private readonly tokens: SessionTokens,
    ) {}

    /** For work a service does on a user's behalf outside their request — a sync run, a Forge job. The token still only works while they're an active member. */
    @MicroserviceCall(Calls.MintUserToken, { from: ['data-connection', 'forge'] })
    public async mintUserToken(_principal: Principal, request: Calls.MintUserToken.Request) {
        return {
            token:     await this.tokens.mint(request.userRid, request.via),
            expiresAt: new Date(Date.now() + SESSION_TOKEN_TTL_MS),
        };
    }
}
