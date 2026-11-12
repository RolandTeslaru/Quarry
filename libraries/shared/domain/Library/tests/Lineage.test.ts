import { describe, expect, it } from "vitest"
import { Dataset } from "../../Dataset/Dataset"
import { Lineage } from "../Lineage"
import type { Resource } from "../Resource"

const [A, B, C, D, E] = [Dataset.createRid(), Dataset.createRid(), Dataset.createRid(), Dataset.createRid(), Dataset.createRid()]

/** A graph of these resources and edges — only what the functions read. */
function graphOf(rids: Resource.Rid[], edges: [Resource.Rid, Resource.Rid][]): Lineage.Graph {
    const resources: Record<Resource.Rid, Resource.Base> = {}
    const lineageEdges: Lineage.Edge[] = []

    for (const rid of rids)
        resources[rid] = { rid } as Resource.Base

    for (const [upstreamRid, downstreamRid] of edges)
        lineageEdges.push({ upstreamRid, downstreamRid, branch: "main" as Lineage.Edge["branch"], declaredByRid: upstreamRid })

    return Lineage.Graph.create(resources, lineageEdges)
}

describe("Lineage.Graph.create", () => {

    it("works out each resource's parents and children — none for a root or a leaf", () => {
        const graph = graphOf([A, B, C], [[A, C], [B, C]])

        expect(graph.parentsOf).toEqual({ [A]: [], [B]: [], [C]: [A, B] })
        expect(graph.childrenOf).toEqual({ [A]: [C], [B]: [C], [C]: [] })
    })
})

describe("Lineage.Staleness.getDistances", () => {

    it("counts from the nearest stale resource: a chain with two stale starts again at each", () => {
        const graph = graphOf([A, B, C, D], [[A, B], [B, C], [C, D]])
        const reasons = { [A]: ["logic-changed" as const], [B]: [], [C]: ["logic-changed" as const], [D]: [] }

        expect(Lineage.Staleness.getDistances(graph, reasons)).toEqual({ [A]: 0, [B]: 1, [C]: 0, [D]: 1 })
    })

    it("takes the shorter path in a diamond", () => {
        // A → B → C → E, and A → D → E
        const graph = graphOf([A, B, C, D, E], [[A, B], [B, C], [C, E], [A, D], [D, E]])
        const reasons = { [A]: ["inputs-changed" as const], [B]: [], [C]: [], [D]: [], [E]: [] }

        expect(Lineage.Staleness.getDistances(graph, reasons)[E]).toBe(2)
    })

    it("gives null where nothing at or above is stale", () => {
        const graph = graphOf([A, B, C], [[A, B]])
        const reasons = { [A]: [], [B]: [], [C]: ["never-built" as const] }

        expect(Lineage.Staleness.getDistances(graph, reasons)).toEqual({ [A]: null, [B]: null, [C]: 0 })
    })

    it("ends on a cycle", () => {
        const graph = graphOf([A, B, C], [[A, B], [C, B], [B, C]])
        const reasons = { [A]: ["logic-changed" as const], [B]: [], [C]: [] }

        expect(Lineage.Staleness.getDistances(graph, reasons)).toEqual({ [A]: 0, [B]: 1, [C]: 2 })
    })
})
