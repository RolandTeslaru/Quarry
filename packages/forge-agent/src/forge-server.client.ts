/// <reference types="node" />
import { Injectable } from '@nestjs/common';
import axios, { isAxiosError, type AxiosInstance } from 'axios';
import { Forge } from '@quarry/shared/domain';
import { requireEnv } from '@quarry/shared/server/env';
import { System } from '@quarry/shared/server/system';

import Agent = Forge.API.Agent;

/** How long the agent waits for one server answer. */
const REQUEST_TIMEOUT_MS = 30_000;

/** Between health checks while the server is still starting. */
const WAIT_INTERVAL_MS = 1_000;

/**
 * The agent's connection to the server's ForgeAgent API (`/api/forge-agent/…`),
 * with the ForgeAgent token — the only key the agent holds. Not the internal
 * service token: agents run next to user code. A refusal (409) comes back as
 * null / false, so callers never see HTTP.
 */
@Injectable()
export class ForgeServerClient {

    private readonly log = System.log.withContext('ServerConnection');

    private readonly api: AxiosInstance = axios.create({
        baseURL: requireEnv('QUARRY_SERVER_URL'),
        headers: { authorization: `Bearer ${requireEnv('FORGE_AGENT_TOKEN')}` },
        timeout: REQUEST_TIMEOUT_MS,
    });

    /** Blocks until the server answers its health check — started together, the agent may come up first. */
    public async waitForServer(): Promise<void> {
        for (let attempt = 1; ; attempt++) {
            try {
                await this.api.get('/api/health', { timeout: 2_000 });

                return;
            }
            catch {
                if (attempt % 10 === 0)
                    this.log.info(`Waiting for the server at ${requireEnv('QUARRY_SERVER_URL')}…`);

                await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
            }
        }
    }

    /** Null if this attempt isn't waiting to be claimed — a duplicate message, or a canceled build. */
    public async claim(message: Forge.Queue.RunJob.Job): Promise<Agent.Claim.Response | null> {
        try {
            return await Agent.claim(this.api, message.jobRid, { attempt: message.attempt });
        }
        catch (error) {
            if (isAxiosError(error) && error.response?.status === 409)
                return null;

            throw error;
        }
    }

    public async heartbeat(message: Forge.Queue.RunJob.Job): Promise<Agent.Heartbeat.Response> {
        return Agent.heartbeat(this.api, message.jobRid, { attempt: message.attempt });
    }

    /** False if the server refused it: the job was canceled while it ran (its build canceled or failed). */
    public async finish(message: Forge.Queue.RunJob.Job, status: 'succeeded' | 'failed'): Promise<boolean> {
        try {
            await Agent.finish(this.api, message.jobRid, { attempt: message.attempt, status });

            return true;
        }
        catch (error) {
            if (isAxiosError(error) && error.response?.status === 409)
                return false;

            throw error;
        }
    }
}
