/// <reference types="node" />
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { Keychain } from "../domain"

/**
 * Server and Data Connection worker only (never the browser): the server writes
 * blobs, and both read them with the workspace's one key, QUARRY_ENCRYPTION_KEY.
 * One implementation so the format can't drift between the two.
 *
 * A blob is `keyId:iv:authTag:ciphertext` (hex). Only the key is secret — the
 * other three are needed to decrypt and travel in the open.
 */
export namespace Encryption {

    const ALGORITHM   = "aes-256-gcm"
    const IV_BYTES    = 12                // GCM's standard nonce size
    const KEY_HEX_LEN = 64                // 32 bytes as hex

    function currentKey(): Buffer {
        const key = process.env.QUARRY_ENCRYPTION_KEY

        if (!key || !new RegExp(`^[0-9a-fA-F]{${KEY_HEX_LEN}}$`).test(key))
            throw new Error("QUARRY_ENCRYPTION_KEY must be a 64-character hex string (32 bytes) — generate one with `openssl rand -hex 32`")

        return Buffer.from(key, "hex")
    }

    /**
     * A short, stable label for a key, derived from the key itself — never stored
     * or passed alongside, and a key restored from a backup can always be matched
     * to the blobs it opens. A truncated hash of a 256-bit random key reveals nothing useful.
     */
    export function keyId(key: Buffer = currentKey()): string {
        return createHash("sha256").update(key).digest("hex").slice(0, 8)
    }

    /**
     * The key a blob says it needs. One key exists, so this matches or fails —
     * but legibly: without the id a blob from another key reads as "unable to
     * authenticate data", indistinguishable from tampering. Rotation is this
     * consulting a set instead of one value.
     */
    function keyFor(id: string): Buffer {
        const current = currentKey()

        if (keyId(current) !== id)
            throw new Error(`No encryption key with id ${id}; the current key is ${keyId(current)}`)

        return current
    }

    /** Fails at boot rather than on the first credential. */
    export function assertConfigured(): void {
        currentKey()
    }

    /** All of a credential's values, encrypted together as one JSON payload. */
    export function encrypt(values: Keychain.Credential.Values): Keychain.Credential.Blob {
        const key    = currentKey()
        const iv     = randomBytes(IV_BYTES)
        const cipher = createCipheriv(ALGORITHM, key, iv)

        const ciphertext = Buffer.concat([cipher.update(JSON.stringify(values), "utf8"), cipher.final()])

        return Keychain.Credential.Blob.parse([
            keyId(key),
            iv.toString("hex"),
            cipher.getAuthTag().toString("hex"),
            ciphertext.toString("hex"),
        ].join(":"))
    }

    export function decrypt(blob: Keychain.Credential.Blob): Keychain.Credential.Values {
        const [id, ivHex, authTagHex, ciphertextHex] = blob.split(":")

        if (!id || !ivHex || !authTagHex || !ciphertextHex)
            throw new Error("Malformed encrypted blob")

        const decipher = createDecipheriv(ALGORITHM, keyFor(id), Buffer.from(ivHex, "hex"))

        // Authenticated: a wrong key and a tampered blob fail the same way, so
        // neither can be mistaken for corrupt data worth working around.
        decipher.setAuthTag(Buffer.from(authTagHex, "hex"))

        const plaintext = Buffer
            .concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()])
            .toString("utf8")

        return Keychain.Credential.Values.parse(JSON.parse(plaintext))
    }
}
