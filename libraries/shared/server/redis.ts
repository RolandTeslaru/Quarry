/// <reference types="node" />
import type { ConnectionOptions } from 'bullmq';
import { requireEnv } from './env';

/** Key prefix for every queue, so a shared Redis can't collide with other apps — the server and every worker use it. */
export const QUEUE_PREFIX = 'quarry';

/** BullMQ's connection, from REDIS_URL. */
export function redisConnection(): ConnectionOptions {
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
