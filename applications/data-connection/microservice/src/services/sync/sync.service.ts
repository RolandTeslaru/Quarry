import { Injectable, NotFoundException } from '@nestjs/common';
import { DataConnection } from '@quarry/shared/domain';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { GatekeeperService } from '@quarry/platform-kernel/services/Gatekeeper/gatekeeper.service';
import { CatalogClient } from '@quarry/platform-kernel/microservice/clients';
import { SecurityGate } from '@quarry/platform-kernel/services/Gatekeeper/security-gate';
import { DataConnectionDB } from '../data-connection/data-connection.db';
import { SourceService } from '../source/source.service';
import { PublisherService } from '../publisher/publisher.service';
import { validateSyncConfig } from './sync-definition';
import { SyncRepository } from './sync.repository';

/** Syncs: what to copy from a source into a dataset. Each publishes a Forge recipe; running one is a build of its dataset. */
@Injectable()
export class SyncService {

    constructor(
        readonly gatekeeper:           GatekeeperService,
        private readonly sources:      SourceService,
        private readonly catalog:      CatalogClient,
        private readonly publisher:    PublisherService,
        private readonly repository:   SyncRepository,
    ) {}

    /**
     * Creates the output dataset (write on its folder: RLS) and the sync, then publishes
     * the source's recipes. Gated on the source up front: the dataset would otherwise
     * exist before RLS refuses the sync row.
     */
    @SecurityGate('write')
    async create(principal: Principal, sourceRid: DataConnection.Source.Rid, request: DataConnection.API.Sync.Create.Request): Promise<DataConnection.Sync> {
        const source = await this.sources.require(principal, sourceRid);
        const config = validateSyncConfig(source, request.config);

        const dataset = await this.catalog.createDataset(principal, {
            parentRid:   request.output.parentRid,
            name:        request.output.name,
            description: `Raw copy written by sync "${request.name}"`,
        });

        const row = await this.repository.create(principal, sourceRid, dataset.rid, {
            rid:      DataConnection.Sync.createRid(),
            name:     request.name,
            config,
            schedule: request.schedule,
        });

        await this.publisher.publish(principal, source);

        return DataConnectionDB.Sync.toDomain(row);
    }

    /** Syncs are listed with discover on the source (RLS); 404 if the source is hidden. */
    async list(principal: Principal, sourceRid: DataConnection.Source.Rid): Promise<DataConnection.Sync[]> {
        await this.sources.require(principal, sourceRid);

        const rows = await this.repository.listForSource(principal, sourceRid);

        return rows.map(DataConnectionDB.Sync.toDomain);
    }

    /** The sync, if it belongs to this source and the principal can discover it (RLS) — or 404. */
    async require(principal: Principal, sourceRid: DataConnection.Source.Rid, syncRid: DataConnection.Sync.Rid): Promise<DataConnectionDB.Sync.Row> {
        const sync = await this.repository.get(principal, syncRid);

        if (!sync || sync.source_rid !== sourceRid)
            throw new NotFoundException('Not found');

        return sync;
    }
}
