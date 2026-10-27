import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { Principal } from '@/auth/principal';
import { CatalogService } from '@/services/Catalog/catalog.service';
import { RealtimeService } from '@/services/Realtime/realtime.service';
import { ForgeRelayService } from '../relay/forge-relay.service';
import { ForgeRepository } from '../forge.repository';

/** ForgeAgents act through the server as the system: they carry no user. */
const AGENT = Principal.SELF('forge.agent');

/**
 * What ForgeAgents do, through the ForgeAgent API only: start a job, renew its
 * lease, finish it — and finishing advances the build. No compute yet: a
 * finished job's outputs are aborted, not committed.
 */
@Injectable()
export class ForgeAgentService {

    private readonly log = System.log.withContext('ForgeAgent');

    constructor(
        private readonly repository: ForgeRepository,
        private readonly catalog:    CatalogService,
        private readonly relay:      ForgeRelayService,
        private readonly realtime:   RealtimeService,
    ) {}

    /** Take the job: once per attempt, from scheduled or queued. 409 if this attempt isn't waiting to start. */
    public async startJob(rid: Forge.Job.Rid, attempt: number): Promise<Forge.API.Agent.Start.Response> {
        const started = await this.repository.startJob(AGENT, rid, attempt);

        if (!started)
            throw new ConflictException(`Job ${rid} attempt ${attempt} isn't waiting to start`);

        this.realtime.emitEvent({
            ...Forge.Event.create('forge:job:updated', { job: started.job }),
            channel: Forge.Event.getChannel(started.job.buildRid),
        });
        this.log.info(`Started ${rid} (attempt ${attempt})`);

        return started;
    }

    /** Renews the attempt's lease. `stop` once it isn't running — its build was canceled or failed. */
    public async heartbeatJob(rid: Forge.Job.Rid, attempt: number): Promise<Forge.API.Agent.Heartbeat.Response> {
        const job = await this.repository.heartbeatJob(AGENT, rid, attempt);

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

        await this.relay.relay(finished.scheduled);

        return { job };
    }

    /** A finish that matched no running attempt: fine if it repeats the outcome already recorded, a 409 otherwise. */
    private async _getRepeatedFinish(rid: Forge.Job.Rid, outcome: Forge.API.Agent.Finish.Request): Promise<Forge.Job.Schema> {
        const job = await this.repository.getJob(AGENT, rid);

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
