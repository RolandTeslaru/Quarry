import * as AccessEventMod from "./AccessEvent"
import * as ApiMod         from "./api"

/**
 * Who accessed what, how and when — and each user's recents. See docs/design/audit.md.
 * Access events are records in Postgres, not realtime events (those are `<Domain>.Event`).
 */
export namespace Audit {
    export import AccessEvent = AccessEventMod.AccessEvent

    export import API = ApiMod.API
}
