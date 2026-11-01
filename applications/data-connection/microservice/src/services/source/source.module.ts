import { Module } from '@nestjs/common';
import { LibraryModule } from '@quarry/platform-kernel/services/Library/library.module';
import { KeychainClient } from '@quarry/platform-kernel/microservice/clients';
import { SourceService } from './source.service';
import { SourceRepository } from './source.repository';

/**
 * Sources. No runtimes — this service can't open a connection to a source system; the Data Connection
 * worker does, with the source's Keychain credential, which it gets encrypted (KeychainClient).
 * SourceRepository is exported for SyncRunService alone: a run loads its source as the system.
 */
@Module({
    imports:   [LibraryModule],
    providers: [KeychainClient, SourceService, SourceRepository],
    exports:   [SourceService, SourceRepository],
})
export class SourceModule {}
