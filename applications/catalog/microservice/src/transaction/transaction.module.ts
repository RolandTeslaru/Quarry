import { Module } from '@nestjs/common';
import { Catalog } from '@quarry/shared/domain';
import { DurableQueueModule } from '@quarry/platform-kernel/infra/durable';
import { TransactionService } from './transaction.service';
import { TransactionRepository } from './transaction.repository';

/**
 * The dataset write protocol and view resolution, beside Catalog. TransactionService is the way in —
 * for Catalog and for Forge, whose `commitBatch` joins the transaction that finishes the job.
 */
@Module({
    imports:   [DurableQueueModule.registerEvent(Catalog.DurableEvent.DatasetUpdated)],
    providers: [TransactionService, TransactionRepository],
    exports:   [TransactionService],
})
export class TransactionModule {}
