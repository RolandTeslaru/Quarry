import * as SourceMod from "./source"
import * as SyncMod   from "./sync"
import * as InternalMod from "./internal"

/** Data Connection's HTTP surface — mirrors data-connection.controller. */
export namespace API {
    export import Source = SourceMod.Source
    export import Sync   = SyncMod.Sync
    /** Worker-only endpoints (`/api/internal/…`). */
    export import Internal = InternalMod.Internal
}
