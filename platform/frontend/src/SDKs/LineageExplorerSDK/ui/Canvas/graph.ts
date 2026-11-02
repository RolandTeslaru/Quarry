import dagre from '@dagrejs/dagre'
import type { Edge, Node, XYPosition } from '@xyflow/react'
import type { Library, LineageExplorer } from '@quarry/shared/domain'

export const NODE_WIDTH = 240
export const NODE_HEIGHT = 56

const COLUMN_GAP = 96
const ROW_GAP = 24

export type ResourceNode = Node<{ resource: Library.Resource.Base }, 'resource'>

export type ExpandDirection = 'upstream' | 'downstream'

export const toResourceNode = (resource: Library.Resource.Base, position: XYPosition): ResourceNode => ({
    id:   resource.rid,
    type: 'resource',
    position,
    data: { resource },
})

/** What's on the canvas that this viewer can see: a saved node with no resource in the graph stays out. */
export function toResourceNodes(exploration: LineageExplorer.Exploration, graph: Library.Lineage.Graph): ResourceNode[] {
    const nodes: ResourceNode[] = []

    for (const resource of Object.values(graph.resources))
        nodes.push(toResourceNode(resource, exploration.nodes[resource.rid]))

    return nodes
}

/** Saved nodes this viewer can't see: they go back with every save, or saving would delete them for everyone. */
export function getHiddenNodes(exploration: LineageExplorer.Exploration, graph: Library.Lineage.Graph): LineageExplorer.Exploration['nodes'] {
    const hidden: LineageExplorer.Exploration['nodes'] = { ...exploration.nodes }

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

/** Dagre, left to right: upstream on the left. */
export function layOut(nodes: ResourceNode[], edges: Edge[]): ResourceNode[] {
    const graph = new dagre.graphlib.Graph()

    graph.setGraph({ rankdir: 'LR', ranksep: COLUMN_GAP, nodesep: ROW_GAP })
    graph.setDefaultEdgeLabel(() => ({}))

    for (const node of nodes)
        graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })

    for (const edge of edges)
        graph.setEdge(edge.source, edge.target)

    dagre.layout(graph)

    const laidOut: ResourceNode[] = []

    for (const node of nodes) {
        const { x, y } = graph.node(node.id)

        // Dagre gives centres, React Flow wants corners.
        laidOut.push({ ...node, position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 } })
    }

    return laidOut
}

/** Where new neighbours go: a column beside `origin`, centred on it. Dagre can't pin nodes, so nothing else moves. */
export function placeBeside(origin: XYPosition, direction: ExpandDirection, resources: Library.Resource.Base[]): ResourceNode[] {
    const step = NODE_WIDTH + COLUMN_GAP
    const x = direction === 'upstream' ? origin.x - step : origin.x + step
    const columnHeight = resources.length * NODE_HEIGHT + (resources.length - 1) * ROW_GAP
    const top = origin.y + NODE_HEIGHT / 2 - columnHeight / 2

    const nodes: ResourceNode[] = []

    resources.forEach((resource, index) => {
        nodes.push(toResourceNode(resource, { x, y: top + index * (NODE_HEIGHT + ROW_GAP) }))
    })

    return nodes
}

/** A resource added by hand: under everything on the canvas. */
export function placeBelow(nodes: ResourceNode[]): XYPosition {
    if (nodes.length === 0)
        return { x: 0, y: 0 }

    let x = Infinity
    let y = -Infinity

    for (const node of nodes) {
        x = Math.min(x, node.position.x)
        y = Math.max(y, node.position.y)
    }

    return { x, y: y + NODE_HEIGHT + ROW_GAP }
}
