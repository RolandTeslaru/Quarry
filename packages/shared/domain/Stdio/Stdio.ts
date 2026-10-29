import { z } from "zod"

/**
 * Messages over a process's stdin and stdout, one JSON line each — how a runtime
 * and whoever started it talk (docs/design/forge-runtimes.md §3). Like Realtime,
 * the base: a domain's requests and responses extend `Request.Base` and
 * `Response.Base` with their own fields (`Forge.Runtime.Run`). Events are the
 * transport's own. A domain's fields never use the envelope's names.
 */
export namespace Stdio {

    /** Bumped when a message changes incompatibly. A caller refuses a process that speaks another. */
    export const PROTOCOL = 1

    /** A message without its envelope: what a handler returns, or a caller passes. */
    export type Payload<M> = M extends unknown ? Omit<M, "type" | "id" | "pattern"> : never

    /** A call: answered with one response, or an error, with the same `id`. */
    export namespace Request {
        export const Base = z.object({
            type:    z.literal("request"),
            id:      z.number().int(),
            pattern: z.string(),
        })
        export type  Base = z.infer<typeof Base>

        /** A domain's request: `Base` with its own `pattern` literal and fields. */
        export type Schema = z.ZodObject<{
            type:    z.ZodLiteral<"request">
            id:      z.ZodNumber
            pattern: z.ZodLiteral<string>
        }>
    }

    export namespace Response {
        export const Base = z.object({
            type: z.literal("response"),
            id:   z.number().int(),
        })
        export type  Base = z.infer<typeof Base>

        /** A domain's response: `Base` with its own fields. */
        export type Schema = z.ZodObject<{
            type: z.ZodLiteral<"response">
            id:   z.ZodNumber
        }>
    }

    /** A request's handler threw. */
    export const Error = z.object({
        type:    z.literal("error"),
        id:      z.number().int(),
        message: z.string(),
    })
    export type  Error = z.infer<typeof Error>

    /** What the process sends on its own. Nothing answers. */
    export namespace Event {
        export const Base = z.object({
            type:  z.literal("event"),
            event: z.string(),
        })
        export type  Base = z.infer<typeof Base>

        /** The process's first line: it's up, and which protocol it speaks. */
        export const Ready = Base.extend({
            event:    z.literal("ready"),
            runtime:  z.string(),
            protocol: z.number().int(),
        })
        export type  Ready = z.infer<typeof Ready>

        /** A line the process's work printed. */
        export const Log = Base.extend({
            event:  z.literal("log"),
            stream: z.enum(["stdout", "stderr"]),
            line:   z.string(),
        })
        export type  Log = z.infer<typeof Log>

        export const Schema = z.discriminatedUnion("event", [Ready, Log])
        export type  Schema = z.infer<typeof Schema>
    }

    /**
     * What kind of message a line on stdout is. Only the envelope: the line is
     * then parsed whole by its own schema (a call's response, `Event.Schema`).
     */
    export const FromProcess = z.discriminatedUnion("type", [Response.Base, Error, Event.Base])
    export type  FromProcess = z.infer<typeof FromProcess>
}
