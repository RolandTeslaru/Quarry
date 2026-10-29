import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { Principal } from '@/auth/principal';
import { SessionTokens } from '@/auth/session-tokens';
import { CatalogService } from '@/services/Catalog/catalog.service';
import { RealtimeService } from '@/services/Realtime/realtime.service';
import { DurableQueueHandle, InjectDurableQueue } from '@/infra/durable-queue';
import { ForgeRepository } from '../repository/forge.repository';

/** ForgeAgents act through the server as the system: they carry no user. */
const AGENT = Principal.SELF('forge.agent');

/**
 * What ForgeAgents do, through the ForgeAgent API only: claim a job, renew its
 * lease, finish it — and finishing advances the build. Nothing is written yet:
 * a finished job's outputs are aborted, not committed.
 */
@Injectable()
export class ForgeAgentService {

    private readonly log = System.log.withContext('ForgeAgent');

    constructor(
        private readonly repository: ForgeRepository,
        private readonly catalog:    CatalogService,
        private readonly realtime:   RealtimeService,
        private readonly sessionTokens: SessionTokens,
        @InjectDurableQueue(Forge.DurableQueue.RunJob)
        private readonly runJobQueue: DurableQueueHandle<typeof Forge.Queue.RunJob.Definition>,
    ) {}

    /**
     * Grants the claim: once per attempt, from scheduled. 409 if this attempt isn't waiting to be claimed.
     * With it, a token for the build's starter: the job's runtime acts as them.
     */
    public async claimJob(rid: Forge.Job.Rid, attempt: number): Promise<Forge.API.Agent.Claim.Response> {
        const claimed = await this.repository.claimJob(AGENT, rid, attempt);

        if (!claimed)
            throw new ConflictException(`Job ${rid} attempt ${attempt} isn't waiting to be claimed`);

        this.realtime.emitEvent({
            ...Forge.Event.create('forge:job:updated', { job: claimed.job }),
            channel: Forge.Event.getChannel(claimed.job.buildRid),
        });
        this.log.info(`Claimed ${rid} (attempt ${attempt})`);

        // The job's FK guarantees its build; builds are started by people until schedules exist.
        const build = await this.repository.build.get(AGENT, claimed.job.buildRid);
        const token = await this.sessionTokens.mint(build!.createdBy!, 'forge-job');

        return {
            ...claimed,
            token,
        };
    }

    /** Renews the attempt's lease. `stop` once it isn't running — its build was canceled or failed. */
    public async heartbeatJob(rid: Forge.Job.Rid, attempt: number): Promise<Forge.API.Agent.Heartbeat.Response> {
        const job = await this.repository.job.heartbeat(AGENT, rid, attempt);

        return { action: job ? 'continue' : 'stop' };
    }

    /**
     * Records how the attempt ended and advances its build: ready children are
     * scheduled and relayed; a failure cancels the rest of the build. Idempotent:
     * a repeat of an outcome already recorded redoes the cleanup (aborting is
     * safe to repeat) — an agent retries finish until it's answered, so a cleanup
     * that failed the first time is done by the retry.
     */
    public async finishJob(rid: Forge.Job.Rid, outcome: Forge.API.Agent.Finish.Request): Promise<Forge.API.Agent.Finish.Response> {
        const finished = await this.repository.finishJob(AGENT, rid, outcome);
        const job = finished?.job ?? await this._getRepeatedFinish(rid, outcome);

        // Announced in the order they were committed: this job (and the children it scheduled), then what failing cancels.
        if (finished)
            for (const changed of [finished.job, ...finished.scheduled])
                this.realtime.emitEvent({
                    ...Forge.Event.create('forge:job:updated', { job: changed }),
                    channel: Forge.Event.getChannel(changed.buildRid),
                });

        // No compute yet: nothing was written, so the outputs are aborted rather than committed.
        await this.catalog.transaction.abortBatch(AGENT, Forge.Job.getOutputTransactions(job));

        if (outcome.status === 'failed')
            await this._failBuild(job.buildRid);

        if (!finished)
            return { job };

        this.log.info(`Finished ${rid}: ${outcome.status}, ${finished.scheduled.length} job(s) scheduled`);

        await this.runJobQueue.relay();

        return { job };
    }

    /** A finish that matched no running attempt: fine if it repeats the outcome already recorded, a 409 otherwise. */
    private async _getRepeatedFinish(rid: Forge.Job.Rid, outcome: Forge.API.Agent.Finish.Request): Promise<Forge.Job.Schema> {
        const job = await this.repository.job.get(AGENT, rid);

        if (!job)
            throw new NotFoundException('Not found');

        if (job.attempt === outcome.attempt && job.status === outcome.status)
            return job;

        throw new ConflictException(`Job ${rid} attempt ${outcome.attempt} isn't running (it's ${job.status}, attempt ${job.attempt})`);
    }

    /** Cancels the build's unfinished jobs and fails the build, then aborts those jobs' transactions. */
    private async _failBuild(buildRid: Forge.Build.Rid): Promise<void> {
        // Mark first, as canceling does: a canceled job's late finish is refused.
        const canceled = await this.repository.failBuild(AGENT, buildRid);

        for (const job of canceled)
            this.realtime.emitEvent({
                ...Forge.Event.create('forge:job:updated', { job }),
                channel: Forge.Event.getChannel(job.buildRid),
            });

        await this.catalog.transaction.abortBatch(AGENT, canceled.flatMap(Forge.Job.getOutputTransactions));
    }
}
