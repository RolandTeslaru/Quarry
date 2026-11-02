import * as SourceMod from "./source"
import * as SyncMod   from "./sync"
import * as RuntimeMod from "./runtime"

/** Data Connection's HTTP surface — mirrors data-connection.controller. */
export namespace API {
    export import Source = SourceMod.Source
    export import Sync   = SyncMod.Sync
    /** A running sync job's runtime only. */
    export import Runtime = RuntimeMod.Runtime
}
