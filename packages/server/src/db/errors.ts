import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpException,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { NoResultError } from 'kysely';
import { System } from '@quarry/shared/server/system';

// Raw pg errors carry table names, constraint names and rejected values, so
// none of them reach a client.
const BY_SQLSTATE: Record<string, () => HttpException> = {
    '23505': () => new ConflictException('Already exists'),
    '23503': () => new NotFoundException('Not found'),
    '23502': () => new BadRequestException('Missing a required value'),
    '23514': () => new BadRequestException('Invalid value'),
    '22P02': () => new BadRequestException('Malformed value'),
    'P0001': () => new BadRequestException('Not allowed here'),      // RAISE EXCEPTION in our triggers
    '42501': () => new ForbiddenException('Not allowed'),            // a row-level security policy refused the write
};

// What a request can cause on its own (a duplicate name, a RID that doesn't exist, a
// trigger's or RLS's refusal) — logged as warnings. Anything else means our SQL or
// schema is wrong (requests are validated before they get here) — logged as errors.
const CLIENT_CAUSED = new Set(['23505', '23503', 'P0001', '42501']);

const log = System.log.withContext('Database');

/**
 * RLS hides the rows it refuses: an UPDATE or DELETE that touched nothing means
 * the row doesn't exist or isn't yours to change — the same 404 either way.
 */
export function requireAffected(result: { numUpdatedRows?: bigint; numDeletedRows?: bigint }): void {
    if ((result.numUpdatedRows ?? result.numDeletedRows ?? 0n) === 0n)
        throw new NotFoundException('Not found');
}

export function catchDatabaseErrors(fn: (...args: unknown[]) => unknown, operation: string) {
    return async function (this: unknown, ...args: unknown[]) {
        try {
            return await fn.apply(this, args);
        }
        catch (error) {
            if (error instanceof HttpException)
                throw error;

            if (error instanceof NoResultError)
                throw new NotFoundException('Not found');

            const code = (error as { code?: string } | null)?.code;
            const mapped = code ? BY_SQLSTATE[code] : undefined;

            const message = `${operation} failed: ${error instanceof Error ? error.message : String(error)}`;

            if (code && CLIENT_CAUSED.has(code))
                log.warning(message);
            else
                log.error(message, { stack: error instanceof Error ? error.stack : undefined });

            if (mapped)
                throw mapped();

            throw new InternalServerErrorException('Something went wrong');
        }
    };
}
