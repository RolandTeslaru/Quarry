import * as SourceMod from "./source"
import * as SyncMod   from "./sync"

/** Data Connection's HTTP surface — mirrors data-connection.controller. */
export namespace API {
    export import Source = SourceMod.Source
    export import Sync   = SyncMod.Sync
}
