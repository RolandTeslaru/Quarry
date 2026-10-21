import { createParamDecorator, InternalServerErrorException, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Principal } from './principal';

/** The principal AuthGuard attached to this request. */
export const CurrentPrincipal = createParamDecorator((_data: unknown, context: ExecutionContext): Principal.User => {
    const principal = context.switchToHttp().getRequest<Request>().principal;

    if (!principal)
        throw new InternalServerErrorException('No principal — is the route @Public()?');

    return principal;
});

export const PUBLIC = Symbol.for('quarry.auth.public');

/** Skips AuthGuard for this route or controller. */
export const Public = () => SetMetadata(PUBLIC, true);

export const INTERNAL = Symbol.for('quarry.auth.internal');

/**
 * Worker-only route or controller: AuthGuard accepts the service token
 * (QUARRY_INTERNAL_TOKEN) and nothing else — never a user's JWT. The handler
 * acts as the system and builds whatever principal the work needs itself.
 */
export const Internal = () => SetMetadata(INTERNAL, true);
