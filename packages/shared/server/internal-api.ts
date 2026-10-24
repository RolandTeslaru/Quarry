/// <reference types="node" />
import axios, { type AxiosInstance } from 'axios';
import { requireEnv } from './env';
import { System } from './system';

const log = System.log.withContext('ServerConnection');

/** How long a worker waits for one server answer. */
const REQUEST_TIMEOUT_MS = 60_000;

/** Between health checks while the server is still starting. */
const WAIT_INTERVAL_MS = 1_000;

/**
 * The server's /internal API, for the workers — authenticated with the service
 * token. Workers have no database: every read or write goes through here.
 * Created on import: a worker loads its env (load-env) before anything imports this.
 */
export const api: AxiosInstance = axios.create({
    baseURL: requireEnv('QUARRY_SERVER_URL'),
    headers: { authorization: `Bearer ${requireEnv('QUARRY_INTERNAL_TOKEN')}` },
    timeout: REQUEST_TIMEOUT_MS,
});

/** Blocks until the server answers its health check — started together, a worker may come up first. */
export async function waitForServer(): Promise<void> {
    for (let attempt = 1; ; attempt++) {
        try {
            await api.get('/api/health', { timeout: 2_000 });

            return;
        }
        catch {
            if (attempt % 10 === 0)
                log.info(`Waiting for the server at ${requireEnv('QUARRY_SERVER_URL')}…`);

            await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
        }
    }
}
