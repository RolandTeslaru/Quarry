import * as DatasetMod      from "./Dataset"
import * as TransactionMod  from "./Transaction"
import * as ColumnSchemaMod from "./ColumnSchema"
import * as QueueMod        from "./queue"
import * as ApiMod          from "./api"

/** Datasets as versioned file sets (Foundry's Catalog). */
export namespace Catalog {
    export import Dataset      = DatasetMod.Dataset
    export import Transaction  = TransactionMod.Transaction
    export import ColumnSchema = ColumnSchemaMod.ColumnSchema

    export import API   = ApiMod.API
    export import Queue = QueueMod.Queue
}
