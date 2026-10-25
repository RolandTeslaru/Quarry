import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { requireEnv } from '@quarry/shared/server/env';

/**
 * The server's calls only: the service token (QUARRY_INTERNAL_TOKEN) as a
 * Bearer — the same one the worker sends the server's /internal API. Users
 * never reach this API; it isn't published to browsers.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {

    private readonly expected = Buffer.from(requireEnv('QUARRY_INTERNAL_TOKEN'));

    public canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();
        const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
        const given = Buffer.from(token ?? '');

        if (scheme !== 'Bearer' || given.length !== this.expected.length || !timingSafeEqual(given, this.expected))
            throw new UnauthorizedException('Invalid service token');

        return true;
    }
}
