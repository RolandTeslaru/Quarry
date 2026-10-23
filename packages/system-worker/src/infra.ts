// Imported first by main.ts: reflect-metadata before any decorator runs, env before any module reads it.
import 'reflect-metadata';
import * as path from 'node:path';
import { WorkerHost } from '@nestjs/bullmq';
import axios, { type AxiosInstance } from 'axios';
import type { ConnectionOptions, Job } from 'bullmq';
import dotenv from 'dotenv';
import type { Foundations } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';

const log = System.log.withContext('ServerConnection');

// ── env ─────────────────────────────────────────────────────────────────
// src/ → system-worker/ → packages/ → repo root. In containers, env comes from the environment.
const root = (file: string) => path.resolve(__dirname, '../../../', file);

if (process.env.ENV_FILE)
    dotenv.config({ path: root(process.env.ENV_FILE), quiet: true });

dotenv.config({ path: root('.env'), quiet: true });

export function requireEnv(name: string): string {
    const value = process.env[name];

    if (!value)
        throw new Error(`Missing env var ${name}`);

    return value;
}

// ── the server's /internal API ─────────────────────────────────────────

let client: AxiosInstance | undefined;

/** The server, authenticated with the service token. Every database read or write goes through here. */
export function server(): AxiosInstance {
    return (client ??= axios.create({
        baseURL: requireEnv('QUARRY_SERVER_URL'),
        headers: { authorization: `Bearer ${requireEnv('QUARRY_INTERNAL_TOKEN')}` },
        timeout: 60_000,
    }));
}

/** Blocks until the server answers its health check — started together, the worker may come up first. */
export async function waitForServer(): Promise<void> {
    for (let attempt = 1; ; attempt++) {
        try {
            await server().get('/api/health', { timeout: 2_000 });
            return;
        }
        catch {
            if (attempt % 10 === 0)
                log.info(`Waiting for the server at ${requireEnv('QUARRY_SERVER_URL')}…`);

            await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
    }
}

// ── queues ──────────────────────────────────────────────────────────────

/** Same prefix as the server and the Data Connection worker. */
export const QUEUE_PREFIX = 'quarry';

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

/**
 * Base for @Processor classes consuming a queue declared in @quarry/shared:
 * the job is parsed before `handle` sees it, and the result before BullMQ stores it.
 */
export abstract class JobProcessor<Q extends Foundations.Queue.Definition> extends WorkerHost {
    protected abstract readonly definition: Q;
    protected abstract handle(job: Foundations.Queue.JobOf<Q>, raw: Job): Promise<Foundations.Queue.ResultOf<Q>>;

    async process(raw: Job): Promise<Foundations.Queue.ResultOf<Q>> {
        const log = System.log.withContext(this.definition.name);
        const startedAt = performance.now();
        const meta = { jobId: raw.id, job: raw.name, attempt: raw.attemptsMade + 1 };

        // Handling a job isn't its outcome, and scheduled jobs run every few
        // seconds — these lines are for tracing: LOG_LEVEL=debug.
        log.debug('Job received', meta);

        try {
            const job = this.definition.job.parse(raw.data) as Foundations.Queue.JobOf<Q>;
            const result = this.definition.result.parse(await this.handle(job, raw)) as Foundations.Queue.ResultOf<Q>;

            log.debug('Job handled', { ...meta, ms: performance.now() - startedAt });

            return result;
        }
        catch (error) {
            // BullMQ only marks the job failed — log it here, or the worker says nothing.
            log.error('Job failed', {
                ...meta,
                error: error instanceof Error ? error.message : String(error),
                ms:    performance.now() - startedAt,
            });

            throw error;
        }
    }
}
