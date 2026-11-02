import { Module } from '@nestjs/common';
import { LibraryModule } from '@quarry/platform-kernel/services/Library/library.module';
import { KeychainClient } from '@quarry/platform-kernel/microservice/clients';
import { SourceProbes } from './source-probes';
import { SourceService } from './source.service';
import { SourceRepository } from './source.repository';

/**
 * Sources, and asking a source system something (SourceProbes), with its Keychain credential (KeychainClient).
 */
@Module({
    imports:   [LibraryModule],
    providers: [KeychainClient, SourceProbes, SourceService, SourceRepository],
    exports:   [SourceService],
})
export class SourceModule {}
