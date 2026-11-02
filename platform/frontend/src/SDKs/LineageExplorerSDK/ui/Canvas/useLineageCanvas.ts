import { useMemo, useState } from 'react'
import { useEdgesState, useNodesState, useReactFlow, type NodeChange } from '@xyflow/react'
import type { Library, LineageExplorer } from '@quarry/shared/domain'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import { useTask } from '@/hooks/useTask'
import { LineageExplorerSDK } from '../../sdk'
import {
    getHiddenNodes,
    layOut,
    placeBelow,
    placeBeside,
    toFlowEdges,
    toResourceNode,
    toResourceNodes,
    type ExpandDirection,
    type ResourceNode,
} from './graph'

const FIT_VIEW_OPTIONS = { padding: 0.2, duration: 200 }

/**
 * An open exploration's canvas. React Flow's state is the truth until Save: nodes and where they are.
 * Edges are never saved, so they're read again whenever the nodes change.
 */
export function useLineageCanvas(exploration: LineageExplorer.Exploration, graph: Library.Lineage.Graph) {
    const reactFlow = useReactFlow<ResourceNode>()

    // Seeded once: the page remounts for another exploration.
    const [initialNodes] = useState(() => toResourceNodes(exploration, graph))
    const [initialEdges] = useState(() => toFlowEdges(graph.edges))
    const hiddenNodes = useMemo(() => getHiddenNodes(exploration, graph), [exploration, graph])

    const [nodes, setNodes, onNodesChange] = useNodesState<ResourceNode>(initialNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
    const [dirty, setDirty] = useState(false)
    const [saveTask, withSaveTask] = useTask()
    const [expandTask, withExpandTask] = useTask()

    async function refreshEdges(onCanvas: ResourceNode[]) {
        const rids: Library.Resource.Rid[] = []

        for (const node of onCanvas)
            rids.push(node.data.resource.rid)

        const { graph: read } = await LibrarySDK.actions.lineage.getGraph({ rids, branch: exploration.branch })

        setEdges(toFlowEdges(read.edges))
    }

    function handleNodesChange(changes: NodeChange<ResourceNode>[]) {
        onNodesChange(changes)

        for (const change of changes)
            if (change.type === 'remove' || (change.type === 'position' && change.dragging))
                setDirty(true)
    }

    const expand = withExpandTask(async (node: ResourceNode, direction: ExpandDirection) => {
        const rid = node.data.resource.rid
        const request = { branch: exploration.branch, depth: 1, includeTrashed: false }

        const { graph: read } = direction === 'upstream'
            ? await LibrarySDK.actions.lineage.getUpstream(rid, request)
            : await LibrarySDK.actions.lineage.getDownstream(rid, request)

        const onCanvas = reactFlow.getNodes()
        const known = new Set<string>()

        for (const existing of onCanvas)
            known.add(existing.id)

        const neighbours: Library.Resource.Base[] = []

        for (const resource of Object.values(read.resources))
            if (!known.has(resource.rid))
                neighbours.push(resource)

        const next = [...onCanvas, ...placeBeside(node.position, direction, neighbours)]

        setNodes(next)

        if (neighbours.length > 0)
            setDirty(true)

        await refreshEdges(next)
    })

    const addResource = withExpandTask(async (resource: Library.Resource.Base) => {
        const onCanvas = reactFlow.getNodes()

        if (reactFlow.getNode(resource.rid))
            return

        const next = [...onCanvas, toResourceNode(resource, placeBelow(onCanvas))]

        setNodes(next)
        setDirty(true)

        await refreshEdges(next)
    })

    function openAddResource() {
        LibrarySDK.dialogs.openLibrarySelector({
            accept:   ['dataset', 'source'],
            onSelect: addResource,
        })
    }

    function layoutAll() {
        setNodes(layOut(reactFlow.getNodes(), edges))
        setDirty(true)

        window.requestAnimationFrame(() => {
            void reactFlow.fitView(FIT_VIEW_OPTIONS)
        })
    }

    const save = withSaveTask(async () => {
        const saved: LineageExplorer.Exploration['nodes'] = { ...hiddenNodes }

        for (const node of reactFlow.getNodes())
            saved[node.data.resource.rid] = { x: node.position.x, y: node.position.y }

        await LineageExplorerSDK.actions.exploration.save(exploration.rid, saved)

        setDirty(false)
    })

    return {
        nodes,
        edges,
        dirty,
        saving:        saveTask.pending,
        expanding:     expandTask.pending,
        error:         expandTask.error,
        onNodesChange: handleNodesChange,
        onEdgesChange,
        expand,
        openAddResource,
        layoutAll,
        save,
    }
}

export type LineageCanvasState = ReturnType<typeof useLineageCanvas>
