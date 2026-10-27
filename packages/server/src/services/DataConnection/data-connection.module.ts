import { Module } from '@nestjs/common';
import { LibraryModule } from '@/services/Library/library.module';
import { CatalogModule } from '@/services/Catalog/catalog.module';
import { KeychainModule } from '@/services/Keychain/keychain.module';
import { DataConnectionService } from './data-connection.service';
import { DataConnectionRepository } from './repository/data-connection.repository';
import { SourceRepository } from './repository/source.repository';
import { SyncRepository } from './repository/sync.repository';
import { SyncRunRepository } from './repository/sync-run.repository';

/**
 * Data Connection in the server: sources and syncs, and the run lifecycle the
 * Data Connection worker drives through /internal. No runtimes — the server
 * can't open a connection to a source system; packages/data-connection-worker
 * does, with the source's Keychain credential, which it gets encrypted.
 */
@Module({
    imports:   [LibraryModule, CatalogModule, KeychainModule],
    providers: [DataConnectionService, DataConnectionService.Sources, DataConnectionService.Syncs, DataConnectionService.Runs, DataConnectionRepository, SourceRepository, SyncRepository, SyncRunRepository],
    exports:   [DataConnectionService, DataConnectionRepository],
})
export class DataConnectionModule {}
