import { z } from "zod"

type Uuid = `${string}-${string}-${string}-${string}-${string}`

/**
 * A resource identifier: `ri.<service>.<instance>.<type>.<uuidv7>`.
 *
 * Template literal types, not a brand: a dataset RID *is* a library-resource
 * RID *is* a RID with no casts, while a plain string is none of them until it
 * has been parsed.
 */
export type Rid<S extends string = string, T extends string = string> = `ri.${S}.main.${T}.${Uuid}`

export namespace Rid {

    const SEGMENT = /^[a-z][a-z0-9-]*$/
    const UUID    = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

    const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")

    const pattern = (service: string | null, type: string | readonly string[] | null) => {
        const s = service === null ? "[a-z][a-z0-9-]*" : escape(service)
        const t = type === null
            ? "[a-z][a-z0-9-]*"
            : typeof type === "string" ? escape(type) : `(?:${type.map(escape).join("|")})`

        return new RegExp(`^ri\\.${s}\\.main\\.${t}\\.${UUID}$`)
    }

    /** Validates any RID. */
    export const Any = z.string().regex(pattern(null, null), "Not a RID").transform((v) => v as Rid)

    /** Validates a RID of one service and type, e.g. `Rid.generateSchema('catalog', 'dataset')`. */
    export const generateSchema = <S extends string, T extends string>(service: S, type: T) =>
        z.string().regex(pattern(service, type), `Not a ${service} ${type} RID`).transform((v) => v as Rid<S, T>)

    /** Validates a RID of any service whose type is one of `types`. */
    export const ofTypes = <T extends string>(types: readonly T[]) =>
        z.string().regex(pattern(null, types), `Not a RID of type ${types.join(" | ")}`).transform((v) => v as Rid<string, T>)

    export const create = <S extends string, T extends string>(service: S, type: T): Rid<S, T> => {
        if (!SEGMENT.test(service) || !SEGMENT.test(type))
            throw new Error(`Invalid RID segment: ${service}.${type}`)

        return `ri.${service}.main.${type}.${uuidv7()}` as Rid<S, T>
    }

    /** A RID around an existing UUID — e.g. a user RID wrapping the GoTrue user id. */
    export const withLocator = <S extends string, T extends string>(service: S, type: T, locator: string): Rid<S, T> => {
        if (!new RegExp(`^${UUID}$`).test(locator))
            throw new Error(`Not a UUID locator: ${locator}`)

        return generateSchema(service, type).parse(`ri.${service}.main.${type}.${locator}`)
    }

    export const parse = (rid: Rid) => {
        const [, service, instance, type, locator] = rid.split(".")
        return { service, instance, type, locator }
    }
}

/** RFC 9562 UUIDv7: 48-bit millisecond timestamp, then random — time-ordered, index-friendly. */
export function uuidv7(): Uuid {
    const bytes = new Uint8Array(16)
    globalThis.crypto.getRandomValues(bytes)

    const ms = Date.now()
    bytes[0] = (ms / 2 ** 40) & 0xff
    bytes[1] = (ms / 2 ** 32) & 0xff
    bytes[2] = (ms / 2 ** 24) & 0xff
    bytes[3] = (ms / 2 ** 16) & 0xff
    bytes[4] = (ms / 2 ** 8) & 0xff
    bytes[5] = ms & 0xff
    bytes[6] = (bytes[6] & 0x0f) | 0x70     // version 7
    bytes[8] = (bytes[8] & 0x3f) | 0x80     // RFC 4122 variant

    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
