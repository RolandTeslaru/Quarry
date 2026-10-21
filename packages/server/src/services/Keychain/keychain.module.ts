import { Module } from '@nestjs/common';
import { KeychainService } from './keychain.service';
import { KeychainRepository } from './keychain.repository';

/**
 * Providers only; the controller is registered by api.module. Data Connection
 * uses KeychainService.getEncryptedBlob to hand a source's credential to the worker.
 */
@Module({
    providers: [KeychainService, KeychainRepository],
    exports:   [KeychainService],
})
export class KeychainModule {}
