import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { Graph, LineageExplorer } from '@quarry/shared/domain'

/** What React Flow draws a node from: no data, its component reads the document by id. */
export type NodeDriver = Node<Record<string, never>, 'resource'>

export type EdgeDriver = Edge

// Positions are copied: the document's are frozen by Immer, and React Flow owns its drivers.
export function createNodeDriver(node: LineageExplorer.Graph.Node): NodeDriver {
    return {
        id:       node.rid,
        type:     'resource',
        position: {
            x: node.position.x,
            y: node.position.y,
        },
        data:     {},
    }
}

export function createEdgeDriver(id: Graph.Edge.Id, edge: LineageExplorer.Graph.Edge): EdgeDriver {
    return {
        id,
        source:     edge.sourceRid,
        target:     edge.targetRid,
        type:       edge.type,
        // A filled triangle at the downstream end: upstream feeds downstream.
        markerEnd:  {
            type:   MarkerType.ArrowClosed,
            width:  20,
            height: 20,
        },
        selectable: false,
        focusable:  false,
    }
}

export function createNodeDrivers(nodes: Record<Graph.Node.Rid, LineageExplorer.Graph.Node>): NodeDriver[] {
    const drivers: NodeDriver[] = []

    for (const node of Object.values(nodes))
        drivers.push(createNodeDriver(node))

    return drivers
}

export function createEdgeDrivers(edges: Record<Graph.Edge.Id, LineageExplorer.Graph.Edge>): EdgeDriver[] {
    const drivers: EdgeDriver[] = []

    for (const id of Object.keys(edges) as Graph.Edge.Id[])
        drivers.push(createEdgeDriver(id, edges[id]))

    return drivers
}

/**
 * The drivers brought up to the document, keeping every unchanged driver as the same object so React Flow doesn't
 * re-render it. A change the canvas made itself (a drag, a delete) is already applied, so it reconciles to nothing.
 */
export function reconcileNodeDrivers(
    drivers: NodeDriver[],
    nodes:   Record<Graph.Node.Rid, LineageExplorer.Graph.Node>,
): NodeDriver[] {
    const existing: Record<string, NodeDriver> = {}

    for (const driver of drivers)
        existing[driver.id] = driver

    const next: NodeDriver[] = []
    let changed = drivers.length !== Object.keys(nodes).length

    for (const node of Object.values(nodes)) {
        const driver = existing[node.rid]

        if (!driver) {
            next.push(createNodeDriver(node))
            changed = true
        } else if (driver.position.x !== node.position.x || driver.position.y !== node.position.y) {
            next.push({
                ...driver,
                position: {
                    x: node.position.x,
                    y: node.position.y,
                },
            })
            changed = true
        } else {
            next.push(driver)
        }
    }

    if (!changed)
        return drivers

    return next
}

/** An edge's id is its two ends, so an edge that's still there is unchanged. */
export function reconcileEdgeDrivers(
    drivers: EdgeDriver[],
    edges:   Record<Graph.Edge.Id, LineageExplorer.Graph.Edge>,
): EdgeDriver[] {
    const existing: Record<string, EdgeDriver> = {}

    for (const driver of drivers)
        existing[driver.id] = driver

    const next: EdgeDriver[] = []
    let changed = drivers.length !== Object.keys(edges).length

    for (const id of Object.keys(edges) as Graph.Edge.Id[]) {
        const driver = existing[id]

        if (driver) {
            next.push(driver)
        } else {
            next.push(createEdgeDriver(id, edges[id]))
            changed = true
        }
    }

    if (!changed)
        return drivers

    return next
}
