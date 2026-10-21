import {
    ForbiddenException,
    Injectable,
    UnauthorizedException,
    type CanActivate,
    type ExecutionContext,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { jwtVerify } from 'jose';
import { Identity } from '@quarry/shared/domain';
import { requireEnv } from '@/db/table';
import { IdentityService } from '@/services/Identity/identity.service';
import { INTERNAL, PUBLIC } from './current-principal';

/**
 * Authentication: verify the GoTrue JWT locally (no network, no database),
 * then require an active identity.user row — membership of this workspace.
 */
@Injectable()
export class AuthGuard implements CanActivate {

    private secret: Uint8Array | undefined;

    constructor(
        private readonly reflector: Reflector,
        private readonly identity:  IdentityService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        if (this.reflector.getAllAndOverride<boolean>(PUBLIC, [context.getHandler(), context.getClass()]))
            return true;

        const request = context.switchToHttp().getRequest<Request>();
        const [scheme, token] = request.headers.authorization?.split(' ') ?? [];

        if (scheme !== 'Bearer' || !token)
            throw new UnauthorizedException('No token');

        // Worker endpoints: the service token only. A user's JWT never opens them, and the token opens nothing else.
        if (this.reflector.getAllAndOverride<boolean>(INTERNAL, [context.getHandler(), context.getClass()])) {
            if (!this.isServiceToken(token))
                throw new UnauthorizedException('Invalid service token');

            return true;
        }

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

        request.principal = { type: 'user', userRid: member.rid, workspaceRole: member.workspace_role };

        return true;
    }

    private isServiceToken(token: string): boolean {
        const expected = Buffer.from(requireEnv('QUARRY_INTERNAL_TOKEN'));
        const given = Buffer.from(token);

        return given.length === expected.length && timingSafeEqual(given, expected);
    }

    private key(): Uint8Array {
        return (this.secret ??= new TextEncoder().encode(requireEnv('GOTRUE_JWT_SECRET')));
    }
}
