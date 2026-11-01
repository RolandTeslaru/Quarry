import { timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import { importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose';
import { Foundations } from '@quarry/shared/domain';
import { requireEnv } from '@quarry/platform-kernel/db/table';

import MicroserviceCall = Foundations.MicroserviceCall;

const ALGORITHM = 'EdDSA';
const AUDIENCE = 'quarry-services';
const TOKEN_TTL_SECONDS = 60 * 60;

/** Fetched again this long before it expires. */
const REFRESH_BEFORE_MS = 5 * 60_000;

/** This process's service name — `MicroserviceCallsModule.forRoot({ service })`. */
export const SERVICE_NAME = Symbol.for('quarry.microservice-calls.service');

export interface ServiceToken {
    readonly token:     string;
    readonly expiresAt: Date;
}

/** `QUARRY_SERVICE_SECRET_DATA_CONNECTION` — the secret a service asks for its token with. */
export const getServiceSecretName = (service: MicroserviceCall.Microservice): string =>
    `QUARRY_SERVICE_SECRET_${service.toUpperCase().replaceAll('-', '_')}`;

/**
 * Service tokens (docs/design/architecture-split.md §8): which service is calling. Signed by the main
 * server alone, with its private key; verified by every service with the public key — so no service
 * can make one. A service gets its own from the main server with its secret, and refreshes it.
 */
@Injectable()
export class ServiceTokens {

    private current: Promise<ServiceToken> | null = null;

    constructor(@Inject(SERVICE_NAME) private readonly service: MicroserviceCall.Microservice) {}

    /** The main server only: a token for a service whose secret matches. */
    public async issue(service: MicroserviceCall.Microservice, secret: string): Promise<ServiceToken> {
        const expected = Buffer.from(requireEnv(getServiceSecretName(service)));
        const given = Buffer.from(secret);

        if (given.length !== expected.length || !timingSafeEqual(given, expected))
            throw new UnauthorizedException(`Wrong secret for ${service}`);

        return this.sign(service);
    }

    /** Which service the token says is calling — or 401. */
    public async verify(token: string): Promise<MicroserviceCall.Microservice> {
        try {
            const { payload } = await jwtVerify(token, await importSPKI(requireEnv('QUARRY_SERVICE_TOKEN_PUBLIC_KEY'), ALGORITHM), { audience: AUDIENCE });

            return MicroserviceCall.Microservice.parse(payload.sub);
        }
        catch {
            throw new UnauthorizedException('Invalid service token');
        }
    }

    /** This process's own token: signed here in the main server; asked of the main server elsewhere. Refreshed before it expires. */
    public async getOwn(): Promise<string> {
        const current = await this.current;

        if (!current || current.expiresAt.getTime() - Date.now() < REFRESH_BEFORE_MS) {
            const fetching = this.fetchOwn();

            this.current = fetching;

            // A failure isn't remembered: the next call asks again.
            fetching.catch(() => {
                if (this.current === fetching)
                    this.current = null;
            });
        }

        return (await this.current!).token;
    }

    private async fetchOwn(): Promise<ServiceToken> {
        if (this.service === 'main')
            return this.sign('main');

        const { data } = await axios.post<{ token: string; expiresAt: string }>(
            `${requireEnv('QUARRY_SERVER_URL')}/api/internal/service-tokens`,
            { service: this.service, secret: requireEnv(getServiceSecretName(this.service)) },
            { headers: { authorization: `Bearer ${requireEnv('QUARRY_INTERNAL_TOKEN')}` } },
        );

        return { token: data.token, expiresAt: new Date(data.expiresAt) };
    }

    private async sign(service: MicroserviceCall.Microservice): Promise<ServiceToken> {
        const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);
        const token = await new SignJWT({})
            .setProtectedHeader({ alg: ALGORITHM })
            .setSubject(service)
            .setAudience(AUDIENCE)
            .setIssuedAt()
            .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
            .sign(await importPKCS8(requireEnv('QUARRY_SERVICE_TOKEN_PRIVATE_KEY'), ALGORITHM));

        return { token, expiresAt };
    }
}
