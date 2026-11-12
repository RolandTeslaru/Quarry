import { useLayoutEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Background, Controls, ReactFlow, useEdgesState, useNodesState } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Button } from '@quarry/standard-ui/foundations/button'
import type { LineageExplorer } from '@quarry/shared/domain'
import { Empty } from '@/components/Empty'
import { resourceRoute } from '@/routes/shell.layout/components/apps'
import { readTheme } from '@/routes/shell.layout/components/preferences'
import { LineageExplorerSDK } from '../../sdk'
import {
    createEdgeDrivers,
    createNodeDrivers,
    reconcileEdgeDrivers,
    reconcileNodeDrivers,
    type NodeDriver,
} from './drivers'
import { canvasProps, createCanvasCallbacks } from './props'
import { useKeyBindings } from './useKeyBindings'

/** The open exploration's graph: resources you can drag, expand and remove (Delete). Edges are the Library's. */
export function LineageCanvas() {
    const navigate = useNavigate()

    useKeyBindings()

    const [nodes, edges] = LineageExplorerSDK.useDocument(d => [d.nodes, d.edges])
    const isEmpty = Object.keys(nodes).length === 0

    // Seeded once; after that the canvas owns its drivers, and the document's changes are reconciled into them.
    const [seed] = useState(() => ({
        nodeDrivers: createNodeDrivers(nodes),
        edgeDrivers: createEdgeDrivers(edges),
    }))
    const [nodeDrivers, setNodeDrivers] = useNodesState<NodeDriver>(seed.nodeDrivers)
    const [edgeDrivers, setEdgeDrivers] = useEdgesState(seed.edgeDrivers)

    // Before paint, so the canvas never shows a frame behind the document (an arrange fits the view next frame).
    useLayoutEffect(() => {
        setNodeDrivers(drivers => reconcileNodeDrivers(drivers, nodes))
    }, [nodes, setNodeDrivers])

    useLayoutEffect(() => {
        setEdgeDrivers(drivers => reconcileEdgeDrivers(drivers, edges))
    }, [edges, setEdgeDrivers])

    useLayoutEffect(() => {
        return () => {
            LineageExplorerSDK.runtime.reactFlow = null
        }
    }, [])

    const callbacks = useMemo(
        () => createCanvasCallbacks(setNodeDrivers, setEdgeDrivers),
        [setNodeDrivers, setEdgeDrivers],
    )

    function openResource(_event: unknown, driver: NodeDriver) {
        const document = LineageExplorerSDK.document
        const resource = document.selectors.node.get(document, driver.id as LineageExplorer.Graph.Node.Rid).libraryResource

        void navigate(resourceRoute(resource.type, resource.rid))
    }

    return (
        <>
            <ReactFlow<NodeDriver>
                nodes={nodeDrivers}
                edges={edgeDrivers}
                onNodeDoubleClick={openResource}
                colorMode={readTheme()}
                {...canvasProps}
                {...callbacks}
            >
                <Background />
                {/* Bottom right: the bottom left is under the shell's sidebar. */}
                <Controls position='bottom-right' showInteractive={false} />
            </ReactFlow>

            {isEmpty && <EmptyCanvas />}
        </>
    )
}

function EmptyCanvas() {
    return (
        <div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
            <div className='pointer-events-auto'>
                <Empty
                    icon='data-lineage'
                    title='Nothing on the canvas yet'
                    description='Add a resource, then expand it to see what feeds it and what it feeds.'
                    action={(
                        <Button icon='plus' onClick={() => LineageExplorerSDK.actions.graph.openAddResource()}>
                            Add resource
                        </Button>
                    )}
                />
            </div>
        </div>
    )
}
