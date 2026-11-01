import * as RoleMod   from "./Role"
import * as ActionMod from "./Action"
import * as GrantMod  from "./Grant"
import * as ApiMod    from "./api"

/** Authorization vocabulary shared with the frontend. The checks themselves are server-side. */
export namespace Gatekeeper {
    export import Role   = RoleMod.Role
    export import Action = ActionMod.Action
    export import Grant  = GrantMod.Grant

    export import API = ApiMod.API
}
