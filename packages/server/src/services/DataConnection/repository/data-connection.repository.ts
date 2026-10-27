import { Injectable } from '@nestjs/common';
import { Repository } from '@/db/repository';
import { DataConnectionDB } from '../data-connection.db';
import { SourceRepository } from './source.repository';
import { SyncRepository } from './sync.repository';
import { SyncRunRepository } from './sync-run.repository';

/**
 * The `data_connection` schema. A write that spans sources, syncs and runs
 * would be a method here, so it is one transaction — none does yet. `source`,
 * `sync` and `run` expose only what is safe on its own: every method today,
 * each a complete state change (or a read); a new one stays hidden until listed.
 */
@Injectable()
export class DataConnectionRepository extends Repository(DataConnectionDB.database) {

    public readonly source: Pick<SourceRepository, 'create' | 'get' | 'open' | 'list'>;
    public readonly sync:   Pick<SyncRepository, 'create' | 'get' | 'listForSource' | 'listScheduled'>;
    public readonly run:    Pick<SyncRunRepository, 'get' | 'start' | 'attachTransaction' | 'heartbeat' | 'succeed' | 'fail' | 'latestState' | 'list' | 'stuck'>;

    constructor(
        _source: SourceRepository,
        _sync:   SyncRepository,
        _run:    SyncRunRepository,
    ) {
        super();

        this.source = _source;
        this.sync = _sync;
        this.run = _run;
    }
}
