import { Global, Module } from '@nestjs/common';
import { QueueManager } from './queue';
import { FileStorage } from './file-storage';

/** Shared clients: the queue producer and the bucket. */
@Global()
@Module({
    providers: [QueueManager, FileStorage],
    exports:   [QueueManager, FileStorage],
})
export class InfraModule {}
