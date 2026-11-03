import dagre from '@dagrejs/dagre'
import type { Edge, Node, XYPosition } from '@xyflow/react'
import type { Library, LineageExplorer } from '@quarry/shared/domain'

// A node's size until React Flow has measured it: new nodes are placed before they render.
const ESTIMATED_NODE_WIDTH = 200
const ESTIMATED_NODE_HEIGHT = 46

const COLUMN_GAP = 96
const ROW_GAP = 24

export type ResourceNode = Node<{ resource: Library.Resource.Base }, 'resource'>

export type ExpandDirection = 'upstream' | 'downstream'

const getSize = (node: ResourceNode) => ({
    width:  node.measured?.width ?? ESTIMATED_NODE_WIDTH,
    height: node.measured?.height ?? ESTIMATED_NODE_HEIGHT,
})

export const toResourceNode = (resource: Library.Resource.Base, position: XYPosition): ResourceNode => ({
    id:   resource.rid,
    type: 'resource',
    position,
    data: { resource },
})

/** What's on the canvas that this viewer can see: a saved node with no resource in the graph stays out. */
export function toResourceNodes(graph: LineageExplorer.Graph): ResourceNode[] {
    const nodes: ResourceNode[] = []

    for (const resource of Object.values(graph.resources))
        nodes.push(toResourceNode(resource, graph.nodes[resource.rid]))

    return nodes
}

/** Saved nodes this viewer can't see: they go back with every save, or saving would delete them for everyone. */
export function getHiddenNodes(graph: LineageExplorer.Graph): LineageExplorer.Exploration['nodes'] {
    const hidden: LineageExplorer.Exploration['nodes'] = { ...graph.nodes }

    for (const rid of Object.keys(graph.resources) as Library.Resource.Rid[])
        delete hidden[rid]

    return hidden
}

export function toFlowEdges(edges: Library.Lineage.Edge[]): Edge[] {
    const flowEdges: Edge[] = []

    for (const edge of edges) {
        flowEdges.push({
            id:         `${edge.upstreamRid}->${edge.downstreamRid}`,
            source:     edge.upstreamRid,
            target:     edge.downstreamRid,
            selectable: false,
            focusable:  false,
        })
    }

    return flowEdges
}

/**
 * Dagre, left to right: upstream on the left, each node at its measured size. Dagre centres a column's
 * nodes on one x; they're then aligned on their left edges instead, as Foundry's hierarchy is.
 */
export function layOut(nodes: ResourceNode[], edges: Edge[]): ResourceNode[] {
    const graph = new dagre.graphlib.Graph()

    graph.setGraph({ rankdir: 'LR', ranksep: COLUMN_GAP, nodesep: ROW_GAP })
    graph.setDefaultEdgeLabel(() => ({}))

    for (const node of nodes)
        graph.setNode(node.id, getSize(node))

    for (const edge of edges)
        graph.setEdge(edge.source, edge.target)

    dagre.layout(graph)

    // A column is every node Dagre put on the same centre x; its left edge is set by its widest node.
    const columnWidths: Record<number, number> = {}

    for (const node of nodes) {
        const { x } = graph.node(node.id)

        columnWidths[x] = Math.max(columnWidths[x] ?? 0, getSize(node).width)
    }

    const laidOut: ResourceNode[] = []

    for (const node of nodes) {
        const { x, y } = graph.node(node.id)

        laidOut.push({ ...node, position: { x: x - columnWidths[x] / 2, y: y - getSize(node).height / 2 } })
    }

    return laidOut
}

/**
 * Where new neighbours go: a column beside `origin`, centred on it, at their estimated size. Dagre
 * can't pin nodes, so nothing else moves.
 */
export function placeBeside(origin: ResourceNode, direction: ExpandDirection, resources: Library.Resource.Base[]): ResourceNode[] {
    const size = getSize(origin)
    const x = direction === 'upstream'
        ? origin.position.x - COLUMN_GAP - ESTIMATED_NODE_WIDTH
        : origin.position.x + size.width + COLUMN_GAP
    const columnHeight = resources.length * ESTIMATED_NODE_HEIGHT + (resources.length - 1) * ROW_GAP
    const top = origin.position.y + size.height / 2 - columnHeight / 2

    const nodes: ResourceNode[] = []

    resources.forEach((resource, index) => {
        nodes.push(toResourceNode(resource, { x, y: top + index * (ESTIMATED_NODE_HEIGHT + ROW_GAP) }))
    })

    return nodes
}

/** A resource added by hand: under everything on the canvas. */
export function placeBelow(nodes: ResourceNode[]): XYPosition {
    if (nodes.length === 0)
        return { x: 0, y: 0 }

    let x = Infinity
    let bottom = -Infinity

    for (const node of nodes) {
        x = Math.min(x, node.position.x)
        bottom = Math.max(bottom, node.position.y + getSize(node).height)
    }

    return { x, y: bottom + ROW_GAP }
}
