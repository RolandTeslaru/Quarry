import * as AccessEventMod from "./access-event"
import * as InternalMod    from "./internal"

/** Audit's HTTP surface — mirrors audit.controller. */
export namespace API {
    export import AccessEvent = AccessEventMod.AccessEvent
    export import Internal    = InternalMod.Internal
}
