import { Processor } from '@nestjs/bullmq';
import { isAxiosError } from 'axios';
import { Forge } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { JobProcessor } from '@quarry/shared/server/queue';
import { forgeApi } from './forge-api';

import Agent = Forge.API.Agent;

/** How many jobs this machine runs at once — its slots. */
const SLOTS = Number(process.env.FORGE_AGENT_SLOTS ?? 2);

/**
 * One attempt of one job, as the server hands it out:
 *
 *   start (scheduled → running)  →  run  →  finish (succeeded | failed)
 *
 * Scaffold: there's no compute yet. "Run" is a single heartbeat — the server
 * aborts the job's outputs on finish rather than committing them.
 */
@Processor(Forge.Queue.RunJob.Definition.name, { concurrency: SLOTS })
export class RunJobProcessor extends JobProcessor<typeof Forge.Queue.RunJob.Definition> {

    protected readonly definition = Forge.Queue.RunJob.Definition;

    private readonly log = System.log.withContext('RunJob');

    protected async handle(message: Forge.Queue.RunJob.Job): Promise<Forge.Queue.RunJob.Result> {
        const started = await this._start(message);

        if (!started)
            return { status: 'skipped' };

        this.log.info(`Picked up ${message.jobRid} (attempt ${message.attempt})`, {
            build:     started.job.buildRid,
            recipe:   started.recipe.rid,
            transform: started.recipe.logic.transform,
            outputs:   Object.keys(started.job.outputs).length,
        });

        const heartbeat = await Agent.heartbeat(forgeApi, message.jobRid, { attempt: message.attempt });

        if (heartbeat.action === 'stop') {
            this.log.info(`Stopped ${message.jobRid}: its build was canceled`);

            return { status: 'skipped' };
        }

        const finished = await this._finish(message, 'succeeded');

        if (!finished)
            return { status: 'skipped' };

        this.log.info(`Finished ${message.jobRid}: succeeded`);

        return { status: 'succeeded' };
    }

    /** False if the server refused it: the job was canceled while it ran (its build canceled or failed). */
    private async _finish(message: Forge.Queue.RunJob.Job, status: 'succeeded' | 'failed'): Promise<boolean> {
        try {
            await Agent.finish(forgeApi, message.jobRid, { attempt: message.attempt, status });

            return true;
        }
        catch (error) {
            if (isAxiosError(error) && error.response?.status === 409) {
                this.log.info(`${message.jobRid} was canceled while it ran — its outcome is dropped`);

                return false;
            }

            throw error;
        }
    }

    /** Null if the server says this attempt isn't waiting to start — a duplicate message, or a canceled build. */
    private async _start(message: Forge.Queue.RunJob.Job): Promise<Agent.Start.Response | null> {
        try {
            return await Agent.start(forgeApi, message.jobRid, { attempt: message.attempt });
        }
        catch (error) {
            if (isAxiosError(error) && error.response?.status === 409) {
                this.log.info(`Skipped ${message.jobRid} (attempt ${message.attempt}): not waiting to start`);

                return null;
            }

            throw error;
        }
    }
}
