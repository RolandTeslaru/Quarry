import { Controller } from '@nestjs/common';
import { Catalog, Dataset } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { MicroserviceCall } from '@quarry/platform-kernel/microservice/microservice-call.decorator';
import { MicroserviceCallReceiver } from '@quarry/platform-kernel/microservice/microservice-call-receiver';
import { CatalogService } from './catalog/catalog.service';
import { TransactionService } from './transaction/transaction.service';

import Calls = Catalog.Microservice;

/**
 * What Catalog serves other services (docs/design/architecture-split.md §8) — Catalog.Microservice.Calls,
 * each as the user or delegate the caller acts for, so Gatekeeper and RLS decide as on a request.
 */
@Controller()
export class CatalogMicroserviceController {

    constructor(
        readonly microserviceCalls:   MicroserviceCallReceiver,
        private readonly catalog:     CatalogService,
        private readonly transaction: TransactionService,
    ) {}

    @MicroserviceCall(Calls.CreateDataset, { from: ['data-connection', 'forge'] })
    public createDataset(principal: Principal, request: Calls.CreateDataset.Request) {
        return this.catalog.createDataset(principal, request);
    }

    @MicroserviceCall(Calls.Get, { from: ['data-connection', 'forge'] })
    public get(principal: Principal, request: Calls.Get.Request) {
        return this.catalog.get(principal, request.rid);
    }

    @MicroserviceCall(Calls.GetByReference, { from: ['code-workspace'] })
    public getByReference(principal: Principal, request: Calls.GetByReference.Request) {
        return this.catalog.getByReference(principal, request.reference);
    }

    @MicroserviceCall(Calls.GetOrCreateByReference, { from: ['code-workspace'] })
    public getOrCreateByReference(principal: Principal, request: Calls.GetOrCreateByReference.Request) {
        return this.catalog.getOrCreateByReference(principal, request.reference);
    }

    @MicroserviceCall(Calls.OpenTransaction, { from: ['data-connection'] })
    public openTransaction(principal: Principal, request: Calls.OpenTransaction.Request) {
        return this.transaction.open(principal, request.datasetRid, request.type, request.provenance);
    }

    @MicroserviceCall(Calls.RegisterChanges, { from: ['data-connection'] })
    public async registerChanges(principal: Principal, request: Calls.RegisterChanges.Request) {
        await this.transaction.registerChanges(principal, request.datasetRid, request.transactionRid, request.changes);

        return {};
    }

    @MicroserviceCall(Calls.CommitTransaction, { from: ['data-connection'] })
    public async commitTransaction(principal: Principal, request: Calls.CommitTransaction.Request) {
        return { sequence: await this.transaction.commit(principal, request.datasetRid, request.transactionRid, request.schema) };
    }

    /** As the user, or as the calling service — a failed run's cleanup works even when the user lost access. */
    @MicroserviceCall(Calls.AbortTransaction, { from: ['data-connection'] })
    public async abortTransaction(principal: Principal, request: Calls.AbortTransaction.Request) {
        await this.transaction.abort(principal, request.datasetRid, request.transactionRid);

        return {};
    }

    @MicroserviceCall(Calls.AssertNotEmpty, { from: ['forge'] })
    public async assertNotEmpty(principal: Principal, request: Calls.AssertNotEmpty.Request) {
        await this.catalog.assertNotEmpty(principal, new Set(request.datasetRids));

        return {};
    }

    @MicroserviceCall(Calls.OpenTransactions, { from: ['forge'] })
    public async openTransactions(principal: Principal, request: Calls.OpenTransactions.Request) {
        const openings: Parameters<TransactionService['openBatch']>[1] = [];

        for (const datasetRid of Object.keys(request.openings) as Dataset.Rid[])
            openings.push({ datasetRid, ...request.openings[datasetRid] });

        const opened: Calls.OpenTransactions.Response = {};

        for (const transaction of await this.transaction.openBatch(principal, openings, request.branch))
            opened[transaction.datasetRid] = transaction;

        return opened;
    }

    @MicroserviceCall(Calls.CommitTransactions, { from: ['forge'] })
    public async commitTransactions(principal: Principal, request: Calls.CommitTransactions.Request) {
        const transactions: Parameters<TransactionService['commitBatch']>[1] = [];

        for (const datasetRid of Object.keys(request.transactions) as Dataset.Rid[])
            transactions.push({ datasetRid, rid: request.transactions[datasetRid], incrementalState: request.incrementalStates[datasetRid] });

        await this.transaction.commitBatch(principal, transactions);

        return {};
    }

    @MicroserviceCall(Calls.GetIncrementalStates, { from: ['forge'] })
    public getIncrementalStates(principal: Principal, request: Calls.GetIncrementalStates.Request) {
        return this.transaction.getIncrementalStates(principal, request.datasetRids);
    }

    @MicroserviceCall(Calls.GetLatestTransactions, { from: ['forge'] })
    public getLatestTransactions(principal: Principal, request: Calls.GetLatestTransactions.Request) {
        return this.transaction.getLatestMany(principal, request.datasetRids);
    }

    @MicroserviceCall(Calls.GetSchemas, { from: ['ontology'] })
    public getSchemas(principal: Principal, request: Calls.GetSchemas.Request) {
        return this.transaction.getSchemas(principal, request.datasetRids);
    }

    @MicroserviceCall(Calls.AbortTransactions, { from: ['forge'] })
    public async abortTransactions(principal: Principal, request: Calls.AbortTransactions.Request) {
        const transactions: Parameters<TransactionService['abortBatch']>[1] = [];

        for (const datasetRid of Object.keys(request.transactions) as Dataset.Rid[])
            transactions.push({ datasetRid, rid: request.transactions[datasetRid] });

        await this.transaction.abortBatch(principal, transactions);

        return {};
    }

    @MicroserviceCall(Calls.GetSignedReadUrls, { from: ['forge'] })
    public getSignedReadUrls(principal: Principal, request: Calls.GetSignedReadUrls.Request) {
        return this.catalog.storage.getSignedReadUrls(principal, request.datasetRid, request.sequence);
    }

    @MicroserviceCall(Calls.GetSignedWriteUrl, { from: ['forge'] })
    public async getSignedWriteUrl(principal: Principal, request: Calls.GetSignedWriteUrl.Request) {
        return { url: await this.catalog.storage.getSignedWriteUrl(principal, request.datasetRid, request.transactionRid, request.filename) };
    }

    @MicroserviceCall(Calls.RegisterFile, { from: ['forge'] })
    public async registerFile(principal: Principal, request: Calls.RegisterFile.Request) {
        await this.catalog.storage.registerFile(principal, request.datasetRid, request.transactionRid, request.filename, request.bytes);

        return {};
    }
}
