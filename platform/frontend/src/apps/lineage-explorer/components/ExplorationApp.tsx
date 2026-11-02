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

/** The Lineage Explorer app on one exploration. Its route's loader has opened it. */
export function ExplorationApp({ rid }: Props) {
    return (
        <ReactFlowProvider>
            <Exploration rid={rid} />
        </ReactFlowProvider>
    )
}

function Exploration({ rid }: Props) {
    const exploration = LineageExplorerSDK.useStore(state => state.explorations[rid])
    const graph = LineageExplorerSDK.useStore(state => state.graphs[rid])
    const canvas = useLineageCanvas(exploration, graph)

    return (
        <>
            <App.Navbar>
                <App.Navbar.Icon glyph={lineageExplorerApp.glyph} />
                <App.Navbar.Rows>
                    <ResourceBreadcrumbs rid={rid} />
                </App.Navbar.Rows>

                <App.Navbar.Actions>
                    <Button icon='add' onClick={canvas.openAddResource}>Add resource</Button>
                    <Button icon='layout-auto' disabled={canvas.nodes.length === 0} onClick={canvas.layoutAll}>
                        Layout all nodes
                    </Button>
                    <Button intent='primary' icon='floppy-disk' loading={canvas.saving} disabled={!canvas.dirty} onClick={canvas.save}>
                        Save
                    </Button>
                </App.Navbar.Actions>
            </App.Navbar>

            <App.Content className='relative min-h-0 flex-1 overflow-hidden'>
                <LineageCanvas canvas={canvas} />
            </App.Content>
        </>
    )
}
