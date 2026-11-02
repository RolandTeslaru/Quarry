import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { DataConnection, Forge } from '@quarry/shared/domain';
import { decryptCredential } from '@quarry/integrations/core/decrypt-credential';
import { findDefinition } from '@quarry/integrations/definitions';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { ForgeClient } from '@quarry/platform-kernel/microservice/clients';
import { SourceService } from '../source/source.service';

/** What crosses Data Connection's concepts: only that. A source's own work is SourceService's, a sync's SyncService's. */
@Injectable()
export class DataConnectionService {

    constructor(
        private readonly sources: SourceService,
        private readonly forge:   ForgeClient,
    ) {}

    /**
     * What a running sync job connects to: its source, and the credential's values, decrypted. The one route that
     * hands out a secret, so only a job's own token gets it, for the source in its recipe: not a person's session,
     * and not a job that has finished. Keychain still checks read on the credential, as the job's user.
     */
    public async getJobConnection(principal: Principal.User, jobRid: Forge.Job.Rid): Promise<DataConnection.API.Runtime.GetConnection.Response> {
        if (principal.via !== 'forge-job')
            throw new ForbiddenException('Only a running job gets a source\'s credential');

        const { job, recipe } = await this.forge.getJob(principal, { rid: jobRid });

        if (job.status !== 'running')
            throw new ConflictException(`Job ${jobRid} isn't running`);

        if (recipe.runtimeConfig.type !== 'data-connection')
            throw new ForbiddenException(`Job ${jobRid} isn't a sync`);

        const source = await this.sources.require(principal, recipe.runtimeConfig.sourceRid);
        const credential = await this.sources.credentialOf(principal, source);

        return { source, credential: decryptCredential(source, findDefinition(source.definitionId)!, credential) };
    }
}
