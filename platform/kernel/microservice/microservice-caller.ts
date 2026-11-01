import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
    type OnModuleDestroy,
} from '@nestjs/common';
import { ClientProxyFactory, Transport, type ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import type { z } from 'zod';
import { Foundations, Identity } from '@quarry/shared/domain';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { RequestIdentity } from '@quarry/platform-kernel/auth/request-identity';
import { requireEnv } from '@quarry/platform-kernel/db/table';
import { ServiceTokens } from './service-tokens';
import { getSubject } from './subjects';

import MicroserviceCall = Foundations.MicroserviceCall;

/** A refusal rethrown as the exception the callee threw, so the caller can't tell a microservice call from an in-process one. */
const EXCEPTIONS: Record<number, new (message: string) => HttpException> = {
    400: BadRequestException,
    401: UnauthorizedException,
    403: ForbiddenException,
    404: NotFoundException,
    409: ConflictException,
};

/** How long a call may take before the caller gives up on it. */
const CALL_TIMEOUT_MS = 60_000;

/** A minted token is used again until this long before it expires. */
const REUSE_UNTIL_MS = 60 * 60_000;

/**
 * Makes microservice calls (docs/design/architecture-split.md §8) over NATS: the request, this service's
 * token, and who it acts as — the request's user (their own token), a delegate (a token the main server
 * mints for that user and work), or this service itself. A refusal comes back as the HTTP error it was.
 * What the generated clients (`CatalogClient`, …) call; services use those, not this.
 */
@Injectable()
export class MicroserviceCaller implements OnModuleDestroy {

    private client: ClientProxy | null = null;

    private readonly minted = new Map<string, Promise<{ token: string; expiresAt: Date }>>();

    constructor(private readonly tokens: ServiceTokens) {}

    public async call<D extends MicroserviceCall.Definition>(definition: D, principal: Principal, request: z.input<D['Request']>): Promise<z.output<D['Response']>> {
        const message: MicroserviceCall.Message = {
            serviceToken: await this.tokens.getOwn(),
            actingAs:     await this.getActingAs(principal),
            request:      definition.Request.parse(request),
        };

        try {
            const reply = await firstValueFrom(this.getClient().send(getSubject(definition.PATTERN), message).pipe(timeout(CALL_TIMEOUT_MS)));

            return definition.Response.parse(reply) as z.output<D['Response']>;
        }
        catch (error) {
            const failure = MicroserviceCall.Failure.safeParse(error);

            if (failure.success) {
                const Exception = EXCEPTIONS[failure.data.status];

                throw Exception ? new Exception(failure.data.message) : new HttpException(failure.data.message, failure.data.status);
            }

            throw error;
        }
    }

    public async onModuleDestroy(): Promise<void> {
        await this.client?.close();
    }

    private getClient(): ClientProxy {
        return (this.client ??= ClientProxyFactory.create({ transport: Transport.NATS, options: { servers: [requireEnv('NATS_URL')] } }));
    }

    private async getActingAs(principal: Principal): Promise<MicroserviceCall.ActingAs> {
        if (principal.type === 'service')
            return { type: 'service', reason: principal.reason };

        if (principal.type === 'delegate')
            return { type: 'delegate', token: await this.getMintedToken(principal.userRid, principal.via), via: principal.via };

        // The request's own token when it's this user's — else one minted, as for work outside their request.
        const current = RequestIdentity.get();

        if (current?.token && current.userRid === principal.userRid)
            return { type: 'user', token: current.token };

        return { type: 'user', token: await this.getMintedToken(principal.userRid, 'microservice-calls') };
    }

    /** A token for the user and work, from the main server — it alone mints them — reused while it lasts. */
    private async getMintedToken(userRid: Identity.User.Rid, via: string): Promise<string> {
        const key = `${userRid}|${via}`;
        const cached = await this.minted.get(key);

        if (!cached || cached.expiresAt.getTime() - Date.now() < REUSE_UNTIL_MS) {
            const minting = this.call(Identity.Microservice.MintUserToken, Principal.SELF(`token for ${via}`), { userRid, via });

            this.minted.set(key, minting);

            // A failure isn't remembered: the next call asks again.
            minting.catch(() => this.minted.delete(key));
        }

        return (await this.minted.get(key)!).token;
    }
}
