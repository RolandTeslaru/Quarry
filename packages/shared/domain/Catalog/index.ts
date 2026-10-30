import * as TransactionMod  from "./Transaction"
import * as ColumnSchemaMod from "./ColumnSchema"
import * as QueueMod        from "./queue"
import * as ApiMod          from "./api"

/** The service behind datasets (Foundry's Catalog): their transactions, schemas and API. `Dataset` is its own namespace. */
export namespace Catalog {
    export import Transaction  = TransactionMod.Transaction
    export import ColumnSchema = ColumnSchemaMod.ColumnSchema

    export import API   = ApiMod.API
    export import Queue = QueueMod.Queue
}
