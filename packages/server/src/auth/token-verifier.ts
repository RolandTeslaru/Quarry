import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { jwtVerify } from 'jose';
import { Identity } from '@quarry/shared/domain';
import { requireEnv } from '@/db/table';
import { IdentityService } from '@/services/Identity/identity.service';
import type { Principal } from './principal';

/**
 * A GoTrue JWT → the workspace member it belongs to. Verified locally (no
 * network), then the identity.user row must be active. Used by the HTTP guard
 * and by the realtime socket, which can't send headers.
 */
@Injectable()
export class TokenVerifier {

    private secret: Uint8Array | undefined;

    constructor(private readonly identity: IdentityService) {}

    async user(token: string): Promise<Principal.User> {
        let claims: { sub?: string; email?: unknown };

        try {
            ({ payload: claims } = await jwtVerify(token, this.key(), { audience: 'authenticated' }));
        }
        catch {
            throw new UnauthorizedException('Invalid or expired token');
        }

        // GoTrue's `sub` is a UUID; the user's RID wraps it one-to-one.
        let userRid: Identity.User.Rid;

        try {
            userRid = Identity.User.fromAuthId(String(claims.sub));
        }
        catch {
            throw new UnauthorizedException('Invalid token subject');
        }

        const email = typeof claims.email === 'string' ? claims.email : null;
        const member = await this.identity.resolveMember(userRid, email);

        if (!member || member.deactivated_at)
            throw new ForbiddenException('Not a member of this workspace');

        return { type: 'user', userRid: member.rid, workspaceRole: member.workspace_role };
    }

    private key(): Uint8Array {
        return (this.secret ??= new TextEncoder().encode(requireEnv('GOTRUE_JWT_SECRET')));
    }
}
