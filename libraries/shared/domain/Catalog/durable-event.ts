import { z } from "zod"
import { Durable } from "../Durable"
import { Transaction } from "./Transaction"

/** Catalog's durable events (docs/design/durable-queues.md): published in the transaction that makes them true. */
export namespace DurableEvent {

    /** A transaction was committed: the dataset has a new version on its branch — whoever wrote it. Its id: the transaction's RID. */
    export const DatasetUpdated = Durable.Event.define({
        topic:   "catalog:dataset:updated",
        payload: z.object({ transaction: Transaction.Schema }),
    })
}
