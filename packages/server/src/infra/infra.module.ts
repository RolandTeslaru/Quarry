import { Global, Module } from '@nestjs/common';
import { QueueManager } from './queue';
import { FileStorage } from './file-storage';

/** Clients every process needs. DuckDb is not here — only the processes that query data provide it. */
@Global()
@Module({
    providers: [QueueManager, FileStorage],
    exports:   [QueueManager, FileStorage],
})
export class InfraModule {}
