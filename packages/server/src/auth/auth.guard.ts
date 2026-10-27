import {
    Injectable,
    UnauthorizedException,
    type CanActivate,
    type ExecutionContext,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { requireEnv } from '@/db/table';
import { TokenVerifier } from './token-verifier';
import { FORGE_AGENT, INTERNAL, PUBLIC } from './current-principal';

/**
 * Authentication: the service token on /internal endpoints, the ForgeAgent token
 * on /forge-agent endpoints, a member's GoTrue JWT everywhere else (TokenVerifier).
 */
@Injectable()
export class AuthGuard implements CanActivate {

    constructor(
        private readonly reflector: Reflector,
        private readonly tokens:    TokenVerifier,
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
            if (!this.isToken(token, 'QUARRY_INTERNAL_TOKEN'))
                throw new UnauthorizedException('Invalid service token');

            return true;
        }

        // ForgeAgent endpoints: the ForgeAgent token only, which opens nothing else.
        if (this.reflector.getAllAndOverride<boolean>(FORGE_AGENT, [context.getHandler(), context.getClass()])) {
            if (!this.isToken(token, 'FORGE_AGENT_TOKEN'))
                throw new UnauthorizedException('Invalid ForgeAgent token');

            return true;
        }

        request.principal = await this.tokens.user(token);

        return true;
    }

    private isToken(token: string, name: 'QUARRY_INTERNAL_TOKEN' | 'FORGE_AGENT_TOKEN'): boolean {
        const expected = Buffer.from(requireEnv(name));
        const given = Buffer.from(token);

        return given.length === expected.length && timingSafeEqual(given, expected);
    }
}
