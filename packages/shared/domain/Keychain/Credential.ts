import { z } from "zod"
import { Foundations } from "../Foundations"
import { Resource } from "../Library/Resource"

/**
 * A login to an external system — a library resource (project scoped, hidden
 * from the explorer; the Keychain app lists them). Its values are stored
 * encrypted as one Blob and never leave the server in plain text except to an
 * editor who reveals them.
 */
export namespace Credential {

    export type  Rid = Foundations.Rid<"keychain", "credential">
    export const Rid = Foundations.Rid.generateSchema("keychain", "credential")
    export const createRid = () => Foundations.Rid.create("keychain", "credential")

    /**
     * What a credential holds, declared in code next to the source definition
     * that takes it (integrations/<System>/credential.ts) — never created at runtime.
     */
    export namespace Template {
        export const Id = z.string().regex(/^[a-z][a-z0-9-]*$/, "kebab-case template id")
        export type  Id = z.infer<typeof Id>

        /** As the API sends it: Fields as JSON Schema; fields marked `secret: true` render as password inputs. */
        export const Schema = z.object({
            id:           Id,
            displayName:  z.string(),
            icon:         z.string(),
            fieldsSchema: z.record(z.string(), z.unknown()),     // z.toJSONSchema(Fields)
        })
        export type Schema = z.infer<typeof Schema>
    }

    /** All of a credential's values, encrypted together: `keyId:iv:authTag:ciphertext` (hex). */
    export const Blob = z.string().regex(/^[0-9a-f]{8}:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/, "Not an encrypted blob").brand("CredentialBlob")
    export type  Blob = z.infer<typeof Blob>

    /** The decrypted values — validated against the template's Fields wherever they're read or written. */
    export const Values = z.record(z.string(), z.unknown())
    export type  Values = z.infer<typeof Values>

    /** What the Data Connection worker receives for a run or a probe: still encrypted — it decrypts with the workspace key. */
    export const Encrypted = z.object({
        rid:        Rid,
        templateId: Template.Id,
        blob:       Blob,
    })
    export type Encrypted = z.infer<typeof Encrypted>

    /** Never carries the blob or the values. */
    export const Schema = Resource.Base.extend({
        rid:        Rid,
        type:       z.literal("credential"),
        parentRid:  Resource.Rid,
        templateId: Template.Id,
    })
    export type Schema = z.infer<typeof Schema>
}
