import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Foundations } from "../../Foundations"
import { Resource } from "../../Library/Resource"
import { Application } from "../../Platform/Application"
import { Exploration as ExplorationD } from "../Exploration"
import { Graph } from "../Graph"
import { Legend } from "../Legend"

export namespace Exploration {

    export namespace Create {
        export const Request = z.object({
            parentRid:   Resource.Rid,
            name:        Resource.Name,
            description: z.string().nullable().default(null),
            branch:      Foundations.Branch.default(Foundations.MAIN_BRANCH),
            nodes:       ExplorationD.Schema.shape.nodes.default({}),
            legend:      ExplorationD.Schema.shape.legend.default(Legend.DEFAULT),
            edgeType:    ExplorationD.Schema.shape.edgeType.default("bezier"),
        })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ exploration: ExplorationD.Schema })
        export type  Response = z.infer<typeof Response>
    }

    /** Every live exploration the caller can read, without its nodes — Lineage Explorer's home. */
    export namespace List {
        export const Response = z.object({ explorations: ExplorationD.Meta.Schema.array() })
        export type  Response = z.infer<typeof Response>
    }

    /** An app opening the exploration: the saved exploration, its graph read now, the open recorded (audit). */
    export namespace Open {
        /** Which app opened it — recorded with the open. */
        export const Request = z.object({ application: Application.Id })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({
            exploration: ExplorationD.Schema,
            graph:       Graph.Schema,
        })
        export type  Response = z.infer<typeof Response>
    }

    /** Replaces what's on the canvas, its legend, how its edges are drawn and the branch they're read on. Keep the nodes the graph left out: they may be someone else's to see. */
    export namespace Save {
        export const Request = z.object({
            nodes:    ExplorationD.Schema.shape.nodes,
            legend:   ExplorationD.Schema.shape.legend,
            edgeType: ExplorationD.Schema.shape.edgeType,
            branch:   ExplorationD.Schema.shape.branch,
        })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ exploration: ExplorationD.Schema })
        export type  Response = z.infer<typeof Response>
    }

    export async function create(api: AxiosInstance, req: Create.Request): Promise<Create.Response> {
        const { data } = await api.post("/api/lineage-explorer/explorations", req)
        return Create.Response.parse(data)
    }

    export async function list(api: AxiosInstance): Promise<List.Response> {
        const { data } = await api.get("/api/lineage-explorer/explorations")
        return List.Response.parse(data)
    }

    export async function open(api: AxiosInstance, rid: ExplorationD.Rid, req: Open.Request): Promise<Open.Response> {
        const { data } = await api.post(`/api/lineage-explorer/explorations/${rid}/open`, req)
        return Open.Response.parse(data)
    }

    export async function save(api: AxiosInstance, rid: ExplorationD.Rid, req: Save.Request): Promise<Save.Response> {
        const { data } = await api.put(`/api/lineage-explorer/explorations/${rid}`, req)
        return Save.Response.parse(data)
    }
}
