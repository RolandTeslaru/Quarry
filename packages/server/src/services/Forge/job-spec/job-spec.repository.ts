import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Catalog, Forge, Foundations, Library } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { Repository, Transactional } from '@/db/repository';
import { json } from '@/db/table';
import { ForgeDB } from '../forge.db';

/** A spec as a producer publishes it — Forge fills in the RID, branch, producer and who. */
export interface PublishedJobSpec {
    readonly logic:             Forge.JobSpec.Logic;
    readonly inputDatasetRids:  Catalog.Dataset.Rid[];
    readonly outputDatasetRids: Catalog.Dataset.Rid[];
    readonly resources:         Forge.JobSpec.Resources;
}

/** Job specs (immutable) and the pointer saying which one computes each dataset on each branch. */
@Injectable()
export class JobSpecRepository extends Repository(ForgeDB.database) {

    /**
     * Replaces everything the producer publishes on the branch: inserts the new
     * specs, drops the producer's old pointers, points each output at its new
     * spec. An output another producer owns is a conflict.
     */
    @Transactional()
    public async publish(
        principal:   Principal,
        producerRid: Library.Resource.Rid,
        branch:      Foundations.Branch,
        specs:       PublishedJobSpec[],
    ): Promise<Forge.JobSpec.Schema[]> {
        const outputs = specs.flatMap((spec) => spec.outputDatasetRids);

        if (new Set(outputs).size !== outputs.length)
            throw new BadRequestException('Two job specs write the same dataset');

        await this._requireUnowned(producerRid, branch, outputs);

        await this.trx
            .deleteFrom('forge.current_job_spec')
            .where('branch', '=', branch)
            .where('job_spec_rid', 'in', (eb) => eb
                .selectFrom('forge.job_spec')
                .select('rid')
                .where('producer_rid', '=', producerRid)
                .where('branch', '=', branch))
            .execute();

        const published: Forge.JobSpec.Schema[] = [];

        for (const spec of specs)
            published.push(await this._insert(principal, producerRid, branch, spec));

        return published;
    }

    /** The spec computing the dataset on the first of `branches` that has one; null if none does. */
    @Transactional()
    public async getCurrent(principal: Principal, datasetRid: Catalog.Dataset.Rid, branches: Foundations.Branch[]): Promise<Forge.JobSpec.Schema | null> {
        const pointers = await this.trx
            .selectFrom('forge.current_job_spec')
            .selectAll()
            .where('dataset_rid', '=', datasetRid)
            .where('branch', 'in', branches)
            .execute();

        const pointer = branches
            .map((branch) => pointers.find((candidate) => candidate.branch === branch))
            .find((candidate) => candidate !== undefined);

        if (!pointer)
            return null;

        return this.get(principal, pointer.job_spec_rid);
    }

    @Transactional()
    public async get(principal: Principal, rid: Forge.JobSpec.Rid): Promise<Forge.JobSpec.Schema | null> {
        const row = await this.trx
            .selectFrom('forge.job_spec')
            .selectAll()
            .where('rid', '=', rid)
            .executeTakeFirst();

        if (!row)
            return null;

        const inputs = await this.trx
            .selectFrom('forge.job_spec_input_dataset')
            .select('dataset_rid')
            .where('job_spec_rid', '=', rid)
            .execute();

        const outputs = await this.trx
            .selectFrom('forge.job_spec_output_dataset')
            .select('dataset_rid')
            .where('job_spec_rid', '=', rid)
            .execute();

        return ForgeDB.JobSpec.toDomain(
            row,
            inputs.map((input) => input.dataset_rid),
            outputs.map((output) => output.dataset_rid),
        );
    }

    /** The spec, its datasets, and a pointer from each output. */
    private async _insert(
        principal:   Principal,
        producerRid: Library.Resource.Rid,
        branch:      Foundations.Branch,
        spec:        PublishedJobSpec,
    ): Promise<Forge.JobSpec.Schema> {
        const rid = Forge.JobSpec.createRid();

        const row = await this.trx
            .insertInto('forge.job_spec')
            .values({
                rid,
                producer_rid: producerRid,
                branch,
                logic:        json(spec.logic),
                resources:    json(spec.resources),
                published_by: Principal.actorOf(principal),
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        if (spec.inputDatasetRids.length > 0)
            await this.trx
                .insertInto('forge.job_spec_input_dataset')
                .values(spec.inputDatasetRids.map((datasetRid) => ({ job_spec_rid: rid, dataset_rid: datasetRid })))
                .execute();

        await this.trx
            .insertInto('forge.job_spec_output_dataset')
            .values(spec.outputDatasetRids.map((datasetRid) => ({ job_spec_rid: rid, dataset_rid: datasetRid })))
            .execute();

        await this.trx
            .insertInto('forge.current_job_spec')
            .values(spec.outputDatasetRids.map((datasetRid) => ({ dataset_rid: datasetRid, branch, job_spec_rid: rid })))
            .execute();

        return ForgeDB.JobSpec.toDomain(row, spec.inputDatasetRids, spec.outputDatasetRids);
    }

    /**
     * One producer per dataset per branch. The pointer's primary key enforces it;
     * this names the producer when the caller can see it.
     */
    private async _requireUnowned(producerRid: Library.Resource.Rid, branch: Foundations.Branch, outputs: Catalog.Dataset.Rid[]): Promise<void> {
        if (outputs.length === 0)
            return;

        const owned = await this.trx
            .selectFrom('forge.current_job_spec as pointer')
            .innerJoin('forge.job_spec as spec', 'spec.rid', 'pointer.job_spec_rid')
            .select(['pointer.dataset_rid', 'spec.producer_rid'])
            .where('pointer.branch', '=', branch)
            .where('pointer.dataset_rid', 'in', outputs)
            .where('spec.producer_rid', '!=', producerRid)
            .executeTakeFirst();

        if (owned)
            throw new ConflictException(`${owned.dataset_rid} is already produced by ${owned.producer_rid} on ${branch}`);
    }
}
