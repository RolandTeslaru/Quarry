import * as SourceMod  from "./Source"
import * as SyncMod    from "./Sync"
import * as SyncRunMod from "./SyncRun"
import * as QueueMod   from "./queue"
import * as ApiMod     from "./api"

/** External systems and the syncs that copy them into datasets. */
export namespace DataConnection {
    export import Source  = SourceMod.Source
    export import Sync    = SyncMod.Sync
    export import SyncRun = SyncRunMod.SyncRun

    export import API   = ApiMod.API
    export import Queue = QueueMod.Queue
}
