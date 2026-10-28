import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Queue } from "./Queue"

/**
 * A queue whose messages can't be lost: each is added to the platform's outbox
 * (foundations.outbox) in the same transaction as the change that calls for it,
 * relayed to Redis, and kept until the work is taken — acked. The sweep sends
 * again what wasn't. Declared beside the plain queue it relays to; the runtime is
 * the server's. docs/design/durable-queues.md.
 */
export namespace DurableQueue {

    /** Sent this long without an ack: sent again (free if it's still waiting — the same job id). */
    export const DEFAULT_STALE_SENT_MINUTES = 2

    /** A message sent this often is logged: its ack is probably missing. */
    export const SUSPICIOUS_SENDS = 10

    export interface Definition<Q extends Queue.Definition = Queue.Definition> {
        /** The plain queue's — one durable queue per queue. */
        readonly name:             Q["name"]
        readonly queue:            Q
        readonly staleSentMinutes: number
    }

    export const define = <Q extends Queue.Definition>(options: { queue: Q; staleSentMinutes?: number }): Definition<Q> => ({
        name:             options.queue.name,
        queue:            options.queue,
        staleSentMinutes: options.staleSentMinutes ?? DEFAULT_STALE_SENT_MINUTES,
    })

    /** The system worker's minute: every durable queue's stale messages, sent again. */
    export namespace Sweep {
        export const Result = z.object({ relayed: z.number().int() })
        export type  Result = z.infer<typeof Result>

        export const Definition = Queue.define({
            name:    "durable-queue.sweep",
            job:     z.object({}),
            result:  Result,
            options: { removeOnComplete: 50, removeOnFail: 50 },
        })
    }

    /** Server endpoints for workers (`/api/internal/durable-queues/…`, service token). */
    export namespace API {

        export namespace Sweep {
            export const Response = z.object({ relayed: z.number().int() })
            export type  Response = z.infer<typeof Response>
        }

        /** For consumers with no take step of their own (events): the work is done, stop sending it. */
        export namespace Ack {
            export const Request = z.object({ jobId: z.string().min(1) })
            export type  Request = z.infer<typeof Request>
        }

        export async function sweep(api: AxiosInstance): Promise<Sweep.Response> {
            const { data } = await api.post("/api/internal/durable-queues/sweep")
            return Sweep.Response.parse(data)
        }

        export async function ack(api: AxiosInstance, name: Queue.Name, req: Ack.Request): Promise<void> {
            await api.post(`/api/internal/durable-queues/${name}/ack`, req)
        }
    }
}
