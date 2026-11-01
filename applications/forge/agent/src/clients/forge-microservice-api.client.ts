import { Injectable } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';
import { Forge, Stdio } from '@quarry/shared/domain';
import { requireEnv } from '@quarry/shared/server/env';
import { System } from '@quarry/shared/server/system';

/** How long the agent waits for one answer from Forge. */
const REQUEST_TIMEOUT_MS = 30_000;

/** Between health checks while Forge is still starting. */
const WAIT_INTERVAL_MS = 1_000;

/**
 * The agent's connection to the Forge microservice's ForgeAgent API (`/api/forge-agent/…`, FORGE_URL),
 * with the ForgeAgent token — the only key the agent holds. Not the internal service token: agents
 * run next to user code. A refusal comes back as Forge sent it: a 409 when the attempt isn't the one
 * to claim or finish.
 */
@Injectable()
export class ForgeMicroserviceAPIClient {

    private readonly log = System.log.withContext('ForgeConnection');

    private readonly http: AxiosInstance = axios.create({
        baseURL: requireEnv('FORGE_URL'),
        headers: { authorization: `Bearer ${requireEnv('FORGE_AGENT_TOKEN')}` },
        timeout: REQUEST_TIMEOUT_MS,
    });

    /** Blocks until Forge answers its health check — started together, the agent may come up first. */
    public async waitForForge(): Promise<void> {
        for (let attempt = 1; ; attempt++) {
            try {
                await this.http.get('/api/health', { timeout: 2_000 });

                return;
            }
            catch {
                if (attempt % 10 === 0)
                    this.log.info(`Waiting for Forge at ${requireEnv('FORGE_URL')}…`);

                await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
            }
        }
    }

    public async claim(message: Forge.Queue.RunJob.Job): Promise<Forge.API.Agent.Claim.Response> {
        return Forge.API.Agent.claim(this.http, message.jobRid, { attempt: message.attempt });
    }

    public async heartbeat(message: Forge.Queue.RunJob.Job): Promise<Forge.API.Agent.Heartbeat.Response> {
        return Forge.API.Agent.heartbeat(this.http, message.jobRid, { attempt: message.attempt });
    }

    public async finish(message: Forge.Queue.RunJob.Job, outcome: Stdio.Payload<Forge.Runtime.Run.Response>): Promise<Forge.API.Agent.Finish.Response> {
        return Forge.API.Agent.finish(this.http, message.jobRid, {
            attempt: message.attempt,
            status:  outcome.status,
            failure: outcome.failure,
        });
    }
}
