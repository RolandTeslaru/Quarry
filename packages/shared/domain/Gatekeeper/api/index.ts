import * as GrantMod from "./grant"

/** Gatekeeper's HTTP surface — mirrors grants.controller. */
export namespace API {
    export import Grant = GrantMod.Grant
}
