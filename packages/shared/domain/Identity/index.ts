import * as UserMod  from "./User"
import * as GroupMod from "./Group"
import * as ApiMod   from "./api"

/** Who is in this workspace. Authentication itself is GoTrue's. */
export namespace Identity {
    export import User  = UserMod.User
    export import Group = GroupMod.Group

    export import API = ApiMod.API
}
