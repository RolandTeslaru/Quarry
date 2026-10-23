import type { ConnectionOptions } from 'bullmq';
import { Redis, type RedisOptions } from 'ioredis';
import { requireEnv } from '@/db/table';

/** Key prefix for every queue, so a shared Redis can't collide with other apps. */
export const QUEUE_PREFIX = 'quarry';

function options(): RedisOptions {
    const url = new URL(requireEnv('REDIS_URL'));

    return {
        host:                 url.hostname,
        port:                 Number(url.port || 6379),
        username:             url.username || undefined,
        password:             url.password ? decodeURIComponent(url.password) : undefined,
        db:                   url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
        tls:                  url.protocol === 'rediss:' ? {} : undefined,
        maxRetriesPerRequest: null,                   // required by BullMQ
    };
}

/**
 * Connection *options*, for users that block on their connection and so need
 * one of their own: QueueEvents (stream reads) and BullMQ Workers.
 */
export function redisConnection(): ConnectionOptions {
    return options();
}

/**
 * A connection of its own for Redis pub/sub: once subscribed, a client can't
 * run other commands, so subscribers never share. The caller closes it.
 */
export function redisSubscriber(): Redis {
    return new Redis(options());
}

let shared: Redis | undefined;

/**
 * One client for every producer Queue in the process — non-blocking commands
 * only, so they can share it. BullMQ doesn't close a connection it was given;
 * closeSharedRedis() does, after the queues are closed.
 */
export function sharedRedis(): Redis {
    return (shared ??= new Redis(options()));
}

export async function closeSharedRedis(): Promise<void> {
    await shared?.quit();
    shared = undefined;
}
