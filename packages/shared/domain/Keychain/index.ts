import * as CredentialMod from "./Credential"
import * as ApiMod        from "./api"

/** Logins to external systems, encrypted at rest — library resources the explorer hides. */
export namespace Keychain {
    export import Credential = CredentialMod.Credential

    export import API = ApiMod.API
}
