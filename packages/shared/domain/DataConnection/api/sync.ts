import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Resource as ResourceD } from "../../Library/Resource"
import { Source as SourceD } from "../Source"
import { Sync as SyncD } from "../Sync"
import { SyncRun as SyncRunD } from "../SyncRun"

/** Syncs live under their source; every path starts at the source. */
export namespace Sync {

    export namespace List {
        export const Response = z.object({ syncs: SyncD.Schema.array() })
        export type  Response = z.infer<typeof Response>
    }

    export namespace Create {
        export const Request = z.object({
            name:     z.string().min(1),
            config:   SyncD.Config,                      // the source's sync Config (see Source.Definition.syncConfigSchema)
            schedule: SyncD.Schedule.default(null),
            /** The raw dataset this sync writes; created alongside it, in this folder. */
            output:   z.object({ parentRid: ResourceD.Rid, name: ResourceD.Name }),
        })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ sync: SyncD.Schema })
        export type  Response = z.infer<typeof Response>
    }

    export namespace ListRuns {
        export const Response = z.object({ runs: SyncRunD.Schema.array() })
        export type  Response = z.infer<typeof Response>
    }

    export async function list(api: AxiosInstance, sourceRid: SourceD.Rid): Promise<List.Response> {
        const { data } = await api.get(`/api/sources/${sourceRid}/syncs`)
        return List.Response.parse(data)
    }

    export async function create(api: AxiosInstance, sourceRid: SourceD.Rid, req: Create.Request): Promise<Create.Response> {
        const { data } = await api.post(`/api/sources/${sourceRid}/syncs`, req)
        return Create.Response.parse(data)
    }

    /** Queues a run (202). Deduplicated: a second request while one is waiting or running is a no-op. */
    export async function run(api: AxiosInstance, sourceRid: SourceD.Rid, syncRid: SyncD.Rid): Promise<void> {
        await api.post(`/api/sources/${sourceRid}/syncs/${syncRid}/run`)
    }

    export async function listRuns(api: AxiosInstance, sourceRid: SourceD.Rid, syncRid: SyncD.Rid): Promise<ListRuns.Response> {
        const { data } = await api.get(`/api/sources/${sourceRid}/syncs/${syncRid}/runs`)
        return ListRuns.Response.parse(data)
    }
}
