import { Module } from '@nestjs/common';
import { LibraryModule } from '@/services/Library/library.module';
import { KeychainService } from './keychain.service';
import { KeychainRepository } from './keychain.repository';

/**
 * Providers only; the controller is registered by api.module. Data Connection
 * uses KeychainService.getEncryptedBlob to hand a source's credential to the worker.
 */
@Module({
    imports:   [LibraryModule],
    providers: [KeychainService, KeychainRepository],
    exports:   [KeychainService],
})
export class KeychainModule {}
