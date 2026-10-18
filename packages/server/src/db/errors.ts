import {
    BadRequestException,
    ConflictException,
    HttpException,
    InternalServerErrorException,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { NoResultError } from 'kysely';

// Raw pg errors carry table names, constraint names and rejected values, so
// none of them reach a client.
const BY_SQLSTATE: Record<string, () => HttpException> = {
    '23505': () => new ConflictException('Already exists'),
    '23503': () => new NotFoundException('Not found'),
    '23502': () => new BadRequestException('Missing a required value'),
    '23514': () => new BadRequestException('Invalid value'),
    '22P02': () => new BadRequestException('Malformed value'),
    'P0001': () => new BadRequestException('Not allowed here'),      // RAISE EXCEPTION in our triggers
};

const logger = new Logger('Database');

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

            logger.warn(`${operation} failed: ${error instanceof Error ? error.message : String(error)}`);

            if (mapped)
                throw mapped();

            throw new InternalServerErrorException('Something went wrong');
        }
    };
}
