import * as CredentialMod from "./credential"

/** Keychain's HTTP surface — mirrors keychain.controller. */
export namespace API {
    export import Credential = CredentialMod.Credential
}
