import { ReactFlowProvider } from '@xyflow/react'
import { Button } from '@quarry/standard-ui/foundations/button'
import type { LineageExplorer } from '@quarry/shared/domain'
import { App } from '@/AppKit'
import { LineageExplorerSDK } from '@/SDKs/LineageExplorerSDK/sdk'
import { LineageCanvas } from '@/SDKs/LineageExplorerSDK/ui/Canvas'
import { useLineageCanvas } from '@/SDKs/LineageExplorerSDK/ui/Canvas/useLineageCanvas'
import { ResourceBreadcrumbs } from '@/components/ResourceBreadcrumbs'
import { lineageExplorerApp } from '../definition'

interface Props {
    rid: LineageExplorer.Exploration.Rid
}

/** The Lineage Explorer app on one exploration: its graph, which its route's loader set as the current one. */
export function ExplorationApp({ rid }: Props) {
    const graph = LineageExplorerSDK.useStore(state => state.currentGraph)

    // Switching explorations: until the new one is loaded, the current graph is still the old one.
    if (graph?.rid !== rid)
        return null

    return (
        <ReactFlowProvider>
            <Exploration graph={graph} />
        </ReactFlowProvider>
    )
}

interface ExplorationProps {
    graph: LineageExplorer.Graph
}

function Exploration({ graph }: ExplorationProps) {
    const canvas = useLineageCanvas(graph)

    return (
        <>
            <App.Background>
                <LineageCanvas canvas={canvas} />
            </App.Background>

            <App.Overlay>
                <App.Nav>
                    <App.Nav.Start>
                        <App.Nav.Icon glyph={lineageExplorerApp.glyph} />
                        <App.Nav.Rows>
                            <ResourceBreadcrumbs rid={graph.rid} />
                        </App.Nav.Rows>
                    </App.Nav.Start>

                    <App.Nav.End>
                        <Button icon='add' onClick={canvas.openAddResource}>Add resource</Button>
                        <Button icon='layout-auto' disabled={canvas.nodes.length === 0} onClick={canvas.layoutAll}>
                            Layout all nodes
                        </Button>
                        <Button intent='primary' icon='floppy-disk' loading={canvas.saving} disabled={!canvas.dirty} onClick={canvas.save}>
                            Save
                        </Button>
                    </App.Nav.End>
                </App.Nav>
            </App.Overlay>
        </>
    )
}
