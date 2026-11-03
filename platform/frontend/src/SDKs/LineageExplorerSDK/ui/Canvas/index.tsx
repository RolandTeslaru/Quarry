import { useNavigate } from '@tanstack/react-router'
import { Background, Controls, ReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Empty } from '@/components/Empty'
import { ErrorNotice } from '@/components/ErrorNotice'
import { resourceRoute } from '@/routes/shell.layout/components/apps'
import { readTheme } from '@/routes/shell.layout/components/preferences'
import { LineageCanvasContext } from './context'
import type { ResourceNode as ResourceNodeType } from './graph'
import { ResourceNode } from './Node'
import type { LineageCanvasState } from './useLineageCanvas'

const NODE_TYPES = { resource: ResourceNode }

const MIN_ZOOM = 0.2

interface Props {
    canvas: LineageCanvasState
}

/** The graph: resources you can drag, expand and remove (Delete). Edges aren't editable: they're the Library's. */
export function LineageCanvas({ canvas }: Props) {
    const navigate = useNavigate()

    function openResource(_event: unknown, node: ResourceNodeType) {
        void navigate(resourceRoute(node.data.resource.type, node.data.resource.rid))
    }

    return (
        <LineageCanvasContext.Provider value={canvas.expand}>
            <ReactFlow<ResourceNodeType>
                nodes={canvas.nodes}
                edges={canvas.edges}
                nodeTypes={NODE_TYPES}
                onNodesChange={canvas.onNodesChange}
                onEdgesChange={canvas.onEdgesChange}
                onNodeDoubleClick={openResource}
                nodesConnectable={false}
                edgesReconnectable={false}
                colorMode={readTheme()}
                minZoom={MIN_ZOOM}
                fitView
            >
                <Background />
                <Controls showInteractive={false} />
            </ReactFlow>

            {canvas.nodes.length === 0 && (
                <div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
                    <div className='pointer-events-auto'>
                        <Empty
                            icon='data-lineage'
                            title='Nothing on the canvas yet'
                            description='Add a resource, then expand it to see what feeds it and what it feeds.'
                            action={<Button icon='add' onClick={canvas.openAddResource}>Add resource</Button>}
                        />
                    </div>
                </div>
            )}

            {canvas.error && (
                <div className='absolute top-3 left-3 max-w-md'>
                    <ErrorNotice error={canvas.error} />
                </div>
            )}
        </LineageCanvasContext.Provider>
    )
}
