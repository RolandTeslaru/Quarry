import { z } from "zod"
import { MicroserviceCall } from "../Foundations/MicroserviceCall"
import { Credential } from "./Credential"

/** What Keychain (in the main server) serves other services (docs/design/architecture-split.md §8). */
export namespace Microservice {

    /** A credential still encrypted, for a run that will use it — read on the credential, as the acting user. */
    export namespace GetEncryptedBlob {
        export const PATTERN = "keychain.get-encrypted-blob"

        export const Request = z.object({ credentialRid: Credential.Rid })
        export type  Request = z.infer<typeof Request>

        export const Response = Credential.Encrypted
        export type  Response = z.infer<typeof Response>
    }

    export const Calls = {
        getEncryptedBlob: GetEncryptedBlob,
    } satisfies MicroserviceCall.Calls
}
