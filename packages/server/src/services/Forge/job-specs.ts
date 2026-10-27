import { Injectable } from '@nestjs/common';
import type { Catalog, Forge, Foundations, Library } from '@quarry/shared/domain';
import type { Principal } from '@/auth/principal';
import { ForgeRepository, type PublishedJobSpec } from './forge.repository';

/**
 * Publishing job specs and reading the current one. Reached as `forge.jobSpecs`
 * — producers call it in-process (a workspace's checks, later Pipeline Builder's
 * deploy); builds read through it.
 */
@Injectable()
export class JobSpecs {

    constructor(private readonly repository: ForgeRepository) {}

    /** Write on the producer, read on every input, write on every output — RLS's call on the inserts. */
    public async publish(
        principal:   Principal,
        producerRid: Library.Resource.Rid,
        branch:      Foundations.Branch,
        specs:       PublishedJobSpec[],
    ): Promise<Forge.JobSpec.Schema[]> {
        return this.repository.publishJobSpecs(principal, producerRid, branch, specs);
    }

    /** What computes the dataset: the first of `branches` with a spec for it wins. */
    public async getCurrent(
        principal:  Principal,
        datasetRid: Catalog.Dataset.Rid,
        branches:   Foundations.Branch[],
    ): Promise<Forge.JobSpec.Schema | null> {
        return this.repository.getCurrentJobSpec(principal, datasetRid, branches);
    }
}
