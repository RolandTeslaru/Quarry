import { z } from "zod"
import { Foundations } from "../Foundations"
import * as DocumentMod from "./Document"

/** What a graph viewer draws: nodes and the edges between them, whatever they stand for. Viewers extend the bases. */
export namespace Graph {
    export import Document = DocumentMod.Document

    export namespace Node {

        /** Any RID, branded as a node: a graph brands its own RID schema with `generateRid`, keeping that RID's type too. */
        export const Rid = Foundations.Rid.Any.brand<"Graph.Node">()
        export type  Rid = z.infer<typeof Rid>

        export const generateRid = <R extends Foundations.Rid>(rid: z.ZodType<R, string>) => rid.brand<"Graph.Node">()

        export const Schema = z.object({
            rid:      Rid,
            position: z.object({
                x: z.number(),
                y: z.number()
            })
        })

        /** The node schema around a graph's own RID, e.g. `generateSchema(Resource.Rid)`; extend it with the graph's own fields. */
        export const generateSchema = <R extends Foundations.Rid>(rid: z.ZodType<R, string>) => {
            return Schema.extend({
                rid: generateRid(rid)
            })
        }
    }
    export type Node = z.infer<typeof Node.Schema>

    export namespace Edge {

        export type  Id = `${Node.Rid}:${Node.Rid}`
        export const Id = z.string()
            .refine(value => {
                const [sourceRid, targetRid, ...rest] = value.split(":")
                return rest.length === 0 && Node.Rid.safeParse(sourceRid).success && Node.Rid.safeParse(targetRid).success
            }, "Not a graph edge id")
            .transform(value => value as Id)

        export const getId = (edge: Edge): Id => `${edge.sourceRid}:${edge.targetRid}`

        export const Type = z.enum(["bezier", "simple-bezier", "straight", "step", "smooth-step", "floating"])
        export type  Type = z.infer<typeof Type>

        export const Schema = z.object({
            sourceRid: Node.Rid,
            targetRid: Node.Rid,
            type:      Type,
        })

        /** The edge schema between a graph's own node RIDs, e.g. `generateSchema(Resource.Rid)`; extend it with the graph's own fields. */
        export const generateSchema = <R extends Foundations.Rid>(rid: z.ZodType<R, string>) => {
            return Schema.extend({
                sourceRid: Node.generateRid(rid),
                targetRid: Node.generateRid(rid),
            })
        }
    }
    export type Edge = z.infer<typeof Edge.Schema>

    /** A graph's schema from its own node and edge schemas, e.g. `generateSchema(Node.Schema, Edge.Schema)`. */
    export const generateSchema = <N extends z.ZodType<Node>, E extends z.ZodType<Edge>>(node: N, edge: E) => z.object({
        nodes: z.record(Node.Rid, node),
        edges: z.record(Edge.Id, edge),
    })

    export const Schema = generateSchema(Node.Schema, Edge.Schema)
}
export type Graph = z.infer<typeof Graph.Schema>
