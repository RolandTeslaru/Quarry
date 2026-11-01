import { Injectable } from '@nestjs/common';
import { SignJWT } from 'jose';
import { Foundations, type Identity } from '@quarry/shared/domain';
import { requireEnv } from '@quarry/platform-kernel/db/table';

/** How long a minted token works: a working day. Re-minted every time the worker acts for the session. */
export const SESSION_TOKEN_TTL_MS = 12 * 60 * 60_000;

/**
 * Tokens Quarry signs itself, for work that runs as a user without their
 * browser: a Code Workspace session's git and previews. Shaped like GoTrue's
 * (same key, `sub`, audience), so TokenVerifier accepts them and checks the
 * user is still an active member on every request.
 */
@Injectable()
export class SessionTokens {

    private secret: Uint8Array | undefined;

    async mint(userRid: Identity.User.Rid, via: string): Promise<string> {
        return new SignJWT({ quarry_via: via })
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject(Foundations.Rid.parse(userRid).locator)
            .setAudience('authenticated')
            .setIssuedAt()
            .setExpirationTime(Math.floor((Date.now() + SESSION_TOKEN_TTL_MS) / 1000))
            .sign(this.key());
    }

    private key(): Uint8Array {
        return (this.secret ??= new TextEncoder().encode(requireEnv('GOTRUE_JWT_SECRET')));
    }
}
