import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Dataset, Forge } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { RealtimeService } from '@quarry/platform-kernel/services/Realtime/realtime.service';
import { CatalogClient, IdentityClient } from '@quarry/platform-kernel/microservice/clients';
import { ForgeRepository } from '../forge/repository/forge.repository';
import { AGENT } from '../forge/forge.service';
import { RecipeService } from '../recipe/recipe.service';

/**
 * A job: claimed and kept alive by a ForgeAgent (as the system), and what its runtime does while it
 * runs — with the job's token, as the build's starter: its inputs' signed read URLs, a signed write URL
 * per output file, and registering those files.
 */
@Injectable()
export class JobService {

    private readonly log = System.log.withContext('Job');

    constructor(
        private readonly repository: ForgeRepository,
        private readonly recipes:    RecipeService,
        private readonly catalog:    CatalogClient,
        private readonly realtime:   RealtimeService,
        private readonly identity:   IdentityClient,
    ) {}

    public async getJob(principal: Principal, rid: Forge.Job.Rid): Promise<Forge.Job> {
        const job = await this.repository.job.get(principal, rid);

        if (!job)
            throw new NotFoundException('Not found');

        return job;
    }

    /**
     * Grants the claim: once per attempt, from scheduled. 409 if this attempt isn't waiting to be claimed.
     * Each input is pinned to its latest version now. With the claim, a token for the build's starter:
     * the job's runtime acts as them.
     */
    public async claimJob(rid: Forge.Job.Rid, attempt: number): Promise<Forge.API.Agent.Claim.Response> {
        const waiting = await this.repository.job.get(AGENT, rid);

        if (!waiting)
            throw new ConflictException(`Job ${rid} attempt ${attempt} isn't waiting to be claimed`);

        // The FKs guarantee the recipe and the build; builds are started by people until schedules exist.
        const recipe = await this.recipes.get(AGENT, waiting.recipeRid);
        const build = (await this.repository.build.get(AGENT, waiting.buildRid))!;
        const inputs: NonNullable<Forge.Job['inputs']> = {};

        for (const datasetRid of recipe.inputDatasetRids)
            inputs[datasetRid] = (await this.catalog.get(AGENT, { rid: datasetRid })).lastSequence;

        const job = await this.repository.claimJob(AGENT, rid, attempt, inputs);

        if (!job)
            throw new ConflictException(`Job ${rid} attempt ${attempt} isn't waiting to be claimed`);

        this.realtime.emitEvent({
            ...Forge.Event.create('forge:job:updated', { job }),
            channel: Forge.Event.getChannel(job.buildRid),
        });
        this.log.info(`Claimed ${rid} (attempt ${attempt})`);

        return {
            job,
            recipe,
            token: (await this.identity.mintUserToken(AGENT, { userRid: build.createdBy!, via: 'forge-job' })).token,
        };
    }

    /** Renews the attempt's lease. `stop` once it isn't running — its build was canceled or failed. */
    public async heartbeatJob(rid: Forge.Job.Rid, attempt: number): Promise<Forge.API.Agent.Heartbeat.Response> {
        const job = await this.repository.job.heartbeat(AGENT, rid, attempt);

        return { action: job ? 'continue' : 'stop' };
    }

    /**
     * The running job's pinned inputs as signed read URLs: what its runtime asks for, with the job's token.
     * Catalog checks read on each input.
     */
    public async getSignedInputUrls(principal: Principal, rid: Forge.Job.Rid): Promise<Forge.API.Runtime.GetSignedInputUrls.Response> {
        const job = await this.getJob(principal, rid);

        if (job.status !== 'running')
            throw new ConflictException(`Job ${rid} isn't running`);

        const inputs: Forge.API.Runtime.GetSignedInputUrls.Response['inputs'] = {};
        const pinned = job.inputs!;                           // pinned when it was claimed, which made it running

        for (const datasetRid of Object.keys(pinned) as Dataset.Rid[])
            inputs[datasetRid] = await this.catalog.getSignedReadUrls(principal, { datasetRid, sequence: pinned[datasetRid] });

        return { inputs };
    }

    /** A URL to PUT one file of a running job's output into the output's open transaction. Catalog checks write on it. */
    public async getSignedOutputUrl(
        principal:  Principal,
        rid:        Forge.Job.Rid,
        datasetRid: Dataset.Rid,
        request:    Forge.API.Runtime.GetSignedOutputUrl.Request,
    ): Promise<Forge.API.Runtime.GetSignedOutputUrl.Response> {
        const job = await this.getJob(principal, rid);

        if (job.status !== 'running')
            throw new ConflictException(`Job ${rid} isn't running`);

        const transactionRid = job.outputs[datasetRid];

        if (!transactionRid)
            throw new NotFoundException(`${datasetRid} isn't an output of job ${rid}`);

        return this.catalog.getSignedWriteUrl(principal, { datasetRid, transactionRid, filename: request.filename });
    }

    /** A file the running job's runtime uploaded, registered on its output: it's committed with the job, if it succeeds. */
    public async registerOutputFile(
        principal:  Principal,
        rid:        Forge.Job.Rid,
        datasetRid: Dataset.Rid,
        request:    Forge.API.Runtime.RegisterOutputFile.Request,
    ): Promise<void> {
        const job = await this.getJob(principal, rid);

        if (job.status !== 'running')
            throw new ConflictException(`Job ${rid} isn't running`);

        const transactionRid = job.outputs[datasetRid];

        if (!transactionRid)
            throw new NotFoundException(`${datasetRid} isn't an output of job ${rid}`);

        await this.catalog.registerFile(principal, { datasetRid, transactionRid, filename: request.filename, bytes: request.bytes });
    }
}
