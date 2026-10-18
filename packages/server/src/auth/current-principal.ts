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
