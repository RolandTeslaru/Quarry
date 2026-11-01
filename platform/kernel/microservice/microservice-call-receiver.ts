import { ForbiddenException, HttpException, Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { ZodError } from 'zod';
import { Foundations } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { RequestIdentity } from '@quarry/platform-kernel/auth/request-identity';
import { TokenVerifier } from '@quarry/platform-kernel/auth/token-verifier';
import { ServiceTokens } from './service-tokens';

import MicroserviceCall = Foundations.MicroserviceCall;

const log = System.log.withContext('ServiceCalls');

export interface MicroserviceCallOptions {
    /** The services that may make this call; any other is refused (403). */
    readonly from: readonly MicroserviceCall.Microservice[];
}

/**
 * Handles every incoming microservice call (docs/design/architecture-split.md §8) before its handler runs:
 * the calling service's token, whether that service may make this call, who it acts as — the user or
 * delegate their token proves, checked as on an HTTP request, or the calling service — and the request
 * against its contract. A refusal or failure goes back as its HTTP status.
 */
@Injectable()
export class MicroserviceCallReceiver {

    constructor(
        private readonly serviceTokens: ServiceTokens,
        private readonly userTokens:    TokenVerifier,
    ) {}

    public async receive<R>(
        definition: MicroserviceCall.Definition,
        options:    MicroserviceCallOptions,
        raw:        unknown,
        handle:     (principal: Principal, request: unknown) => Promise<R>,
    ): Promise<R> {
        try {
            const message = MicroserviceCall.Message.parse(raw);
            const caller = await this.serviceTokens.verify(message.serviceToken);

            if (!options.from.includes(caller))
                throw new ForbiddenException(`${caller} may not call ${definition.PATTERN}`);

            const principal = await this.getPrincipal(caller, message.actingAs);
            const request = definition.Request.parse(message.request);
            const token = message.actingAs.type === 'service' ? null : message.actingAs.token;

            // Calls this handler makes in turn act as the same user, with the same token.
            return await RequestIdentity.run({ userRid: Principal.actorOf(principal), token }, () => handle(principal, request));
        }
        catch (error) {
            throw new RpcException(this.getFailure(definition, error));
        }
    }

    private async getPrincipal(caller: MicroserviceCall.Microservice, actingAs: MicroserviceCall.ActingAs): Promise<Principal> {
        if (actingAs.type === 'service')
            return Principal.SELF(`${caller}: ${actingAs.reason}`);

        const user = await this.userTokens.user(actingAs.token);

        return actingAs.type === 'delegate' ? Principal.delegate(user.userRid, actingAs.via) : user;
    }

    private getFailure(definition: MicroserviceCall.Definition, error: unknown): MicroserviceCall.Failure {
        if (error instanceof HttpException) {
            const response = error.getResponse();
            const message = typeof response === 'object' && response !== null && 'message' in response ? String(response.message) : error.message;

            return { status: error.getStatus(), message };
        }

        if (error instanceof ZodError)
            return { status: 400, message: `Invalid ${definition.PATTERN} call: ${error.issues.map((issue) => issue.message).join('; ')}` };

        log.error(`${definition.PATTERN} failed`, { error: error instanceof Error ? error.message : String(error) });

        return { status: 500, message: `${definition.PATTERN} failed` };
    }
}
