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

const serviceApis: Record<string, AxiosInstance> = {};

/** A service's /internal API, with the same service token — workers call a service directly, not through the main server. */
const getServiceApi = (urlVariable: string): AxiosInstance =>
    (serviceApis[urlVariable] ??= axios.create({
        baseURL: requireEnv(urlVariable),
        headers: { authorization: `Bearer ${requireEnv('QUARRY_INTERNAL_TOKEN')}` },
        timeout: REQUEST_TIMEOUT_MS,
    }));

/**
 * The Catalog service's /internal API (docs/design/architecture-split.md). Created on first use, so a
 * worker that never calls Catalog needn't know where it is.
 */
export const getCatalogApi = (): AxiosInstance => getServiceApi('CATALOG_URL');

/** The Data Connection service's /internal API — its worker's run lifecycle, the system worker's reaper and schedules. */
export const getDataConnectionApi = (): AxiosInstance => getServiceApi('DATA_CONNECTION_URL');

/** The Forge service's /internal API — the system worker's sweep of its outbox. */
export const getForgeApi = (): AxiosInstance => getServiceApi('FORGE_URL');

/** Blocks until the server — or the service a worker works for — answers its health check: started together, a worker may come up first. */
export async function waitForServer(target: AxiosInstance = api): Promise<void> {
    for (let attempt = 1; ; attempt++) {
        try {
            await target.get('/api/health', { timeout: 2_000 });

            return;
        }
        catch {
            if (attempt % 10 === 0)
                log.info(`Waiting for ${target.defaults.baseURL}…`);

            await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
        }
    }
}
