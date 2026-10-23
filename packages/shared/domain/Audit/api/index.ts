import * as AccessEventMod from "./access-event"

/** Audit's HTTP surface — mirrors audit.controller. */
export namespace API {
    export import AccessEvent = AccessEventMod.AccessEvent
}
