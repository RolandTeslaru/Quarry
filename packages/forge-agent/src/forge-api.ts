/// <reference types="node" />
import axios, { type AxiosInstance } from 'axios';
import { requireEnv } from '@quarry/shared/server/env';
import { System } from '@quarry/shared/server/system';

const log = System.log.withContext('ServerConnection');

/** How long the agent waits for one server answer. */
const REQUEST_TIMEOUT_MS = 30_000;

/** Between health checks while the server is still starting. */
const WAIT_INTERVAL_MS = 1_000;

/**
 * The server's ForgeAgent API (`/api/forge-agent/…`), with the ForgeAgent token
 * — the only key the agent holds. Not the internal service token: agents run
 * next to user code. Created on import, after load-env.
 */
export const forgeApi: AxiosInstance = axios.create({
    baseURL: requireEnv('QUARRY_SERVER_URL'),
    headers: { authorization: `Bearer ${requireEnv('FORGE_AGENT_TOKEN')}` },
    timeout: REQUEST_TIMEOUT_MS,
});

/** Blocks until the server answers its health check — started together, the agent may come up first. */
export async function waitForServer(): Promise<void> {
    for (let attempt = 1; ; attempt++) {
        try {
            await forgeApi.get('/api/health', { timeout: 2_000 });

            return;
        }
        catch {
            if (attempt % 10 === 0)
                log.info(`Waiting for the server at ${requireEnv('QUARRY_SERVER_URL')}…`);

            await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
        }
    }
}
