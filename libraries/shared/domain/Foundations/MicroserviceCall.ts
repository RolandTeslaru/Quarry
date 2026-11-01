import { z } from "zod"

/**
 * One service asking another, over NATS (docs/design/architecture-split.md §8). A service's calls are
 * contracts in its domain (`Catalog.Microservice.Calls`); callers use the generated client
 * (`this.catalog.createDataset(principal, request)`), callees mark handlers `@MicroserviceCall(…)`.
 */
export namespace MicroserviceCall {

    /** The services that call or are called — each one's token says which it is. */
    export const Microservice = z.enum(["main", "catalog", "data-connection", "forge", "code-workspace"])
    export type  Microservice = z.infer<typeof Microservice>

    export interface Definition<Req extends z.ZodType = z.ZodType, Res extends z.ZodType = z.ZodType> {
        /** The NATS subject: `<service>.<call>`. */
        readonly PATTERN:  string
        readonly Request:  Req
        readonly Response: Res
    }

    /** A service's calls, by the method name its client gets. */
    export type Calls = Record<string, Definition>

    /** Who a call acts as — the user (their token), a delegate for one (a minted token), or the calling service itself. */
    export const ActingAs = z.discriminatedUnion("type", [
        z.object({ type: z.literal("user"),     token: z.string() }),
        z.object({ type: z.literal("delegate"), token: z.string(), via: z.string() }),
        z.object({ type: z.literal("service"),  reason: z.string() }),
    ])
    export type ActingAs = z.infer<typeof ActingAs>

    /** What travels on the subject: the calling service's token, who it acts as, the call's request. */
    export const Message = z.object({
        serviceToken: z.string(),
        actingAs:     ActingAs,
        request:      z.unknown(),
    })
    export type Message = z.infer<typeof Message>

    /** A refused or failed call, as the caller receives it — an HTTP status, so callers rethrow it unchanged. */
    export const Failure = z.object({
        status:  z.number().int(),
        message: z.string(),
    })
    export type Failure = z.infer<typeof Failure>
}
