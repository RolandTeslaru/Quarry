import {
    applyEdgeChanges,
    applyNodeChanges,
    BezierEdge,
    SimpleBezierEdge,
    SmoothStepEdge,
    StepEdge,
    StraightEdge,
    type ReactFlowProps,
} from '@xyflow/react'
import type { Dispatch, SetStateAction } from 'react'
import type { LineageExplorer } from '@quarry/shared/domain'
import { LineageExplorerSDK } from '../../sdk'
import type { EdgeDriver, NodeDriver } from './drivers'
import { FloatingEdge } from './FloatingEdge'
import { ResourceNode } from './Node'

const MIN_ZOOM = 0.2

// Module-level and frozen, so React Flow never sees a new object.
export const canvasProps = Object.freeze({
    nodeTypes: {
        resource: ResourceNode,
    },
    edgeTypes: {
        'bezier':        BezierEdge,
        'simple-bezier': SimpleBezierEdge,
        'straight':      StraightEdge,
        'step':          StepEdge,
        'smooth-step':   SmoothStepEdge,
        'floating':      FloatingEdge,
    },
    nodesConnectable:   false,
    edgesReconnectable: false,
    minZoom:            MIN_ZOOM,
    fitView:            true,
} satisfies ReactFlowProps<NodeDriver, EdgeDriver>)

type Rid = LineageExplorer.Graph.Node.Rid

/**
 * The canvas's own drivers take every change at once; the document only hears about removals, and about
 * positions once a drag stops, so a drag never touches the store.
 */
export function createCanvasCallbacks(
    setNodeDrivers: Dispatch<SetStateAction<NodeDriver[]>>,
    setEdgeDrivers: Dispatch<SetStateAction<EdgeDriver[]>>,
) {
    return {
        onInit: (reactFlow) => {
            LineageExplorerSDK.runtime.reactFlow = reactFlow
        },

        onNodesChange: (changes) => {
            const removed = new Set<Rid>()

            for (const change of changes)
                if (change.type === 'remove')
                    removed.add(change.id as Rid)

            if (removed.size > 0)
                LineageExplorerSDK.actions.graph.remove(removed)

            setNodeDrivers(drivers => applyNodeChanges(changes, drivers))
        },

        onEdgesChange: (changes) => {
            setEdgeDrivers(drivers => applyEdgeChanges(changes, drivers))
        },

        onNodeDragStop: (_event, _node, nodes) => {
            const positions: Record<Rid, LineageExplorer.Graph.Node['position']> = {}

            for (const node of nodes) {
                positions[node.id as Rid] = {
                    x: node.position.x,
                    y: node.position.y,
                }
            }

            LineageExplorerSDK.actions.graph.setPositions(positions)
        },
    } satisfies ReactFlowProps<NodeDriver, EdgeDriver>
}
