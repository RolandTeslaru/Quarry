import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Dataset, Forge } from '@quarry/shared/domain';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { CatalogClient } from '@quarry/platform-kernel/microservice/clients';
import { JobRepository } from './job.repository';

/** ForgeAgents act through the server as the system: they carry no user. */
export const AGENT = Principal.SELF('forge.agent');

/**
 * A job: kept alive by a ForgeAgent (as the system), and what its runtime does while it runs — with
 * the job's token, as the build's starter: its inputs' signed read URLs, a signed write URL per output
 * file, and registering those files. Claiming and finishing move the build, so they're ForgeService's.
 */
@Injectable()
export class JobService {

    constructor(
        private readonly repository: JobRepository,
        private readonly catalog:    CatalogClient,
    ) {}

    public async getJob(principal: Principal, rid: Forge.Job.Rid): Promise<Forge.Job> {
        const job = await this.repository.get(principal, rid);

        if (!job)
            throw new NotFoundException('Not found');

        return job;
    }

    public async listByBuild(principal: Principal, buildRid: Forge.Build.Rid): Promise<Forge.Job[]> {
        return this.repository.listByBuild(principal, buildRid);
    }

    /** Renews the attempt's lease. `stop` once it isn't running — its build was canceled or failed. */
    public async heartbeatJob(rid: Forge.Job.Rid, attempt: number): Promise<Forge.API.Agent.Heartbeat.Response> {
        const job = await this.repository.heartbeat(AGENT, rid, attempt);

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
