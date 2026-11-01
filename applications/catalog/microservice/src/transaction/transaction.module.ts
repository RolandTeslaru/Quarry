import { Module } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { TransactionRepository } from './transaction.repository';

/**
 * The dataset write protocol and view resolution, beside Catalog. TransactionService is the way in —
 * for Catalog and for Forge, whose `commitBatch` joins the transaction that finishes the job.
 */
@Module({
    providers: [TransactionService, TransactionRepository],
    exports:   [TransactionService],
})
export class TransactionModule {}
