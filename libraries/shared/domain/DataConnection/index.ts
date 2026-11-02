import * as SourceMod  from "./Source"
import * as SyncMod    from "./Sync"
import * as ApiMod     from "./api"

/** External systems and the syncs that copy them into datasets. */
export namespace DataConnection {
    export import Source  = SourceMod.Source
    export import Sync    = SyncMod.Sync

    export import API   = ApiMod.API
}
