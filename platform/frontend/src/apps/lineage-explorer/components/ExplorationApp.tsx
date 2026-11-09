import { Button } from '@quarry/standard-ui/foundations/button'
import type { LineageExplorer } from '@quarry/shared/domain'
import { App } from '@/AppKit'
import { useTask } from '@/hooks/useTask'
import { LineageExplorerSDK } from '@/SDKs/LineageExplorerSDK/sdk'
import { LineageBranchSelect } from '@/SDKs/LineageExplorerSDK/ui/BranchSelect'
import { LineageCanvas } from '@/SDKs/LineageExplorerSDK/ui/Canvas'
import { LineageLegend } from '@/SDKs/LineageExplorerSDK/ui/Legend'
import { LineageToolbar } from '@/SDKs/LineageExplorerSDK/ui/Toolbar'
import { ResourceBreadcrumbs } from '@/components/ResourceBreadcrumbs'
import { lineageExplorerApp } from '../definition'

interface Props {
    rid: LineageExplorer.Exploration.Rid
}

/** The Lineage Explorer app on one exploration: its document, which its route's loader opened. */
export function ExplorationApp({ rid }: Props) {
    const openRid = LineageExplorerSDK.useStore(state => state.document?.exploration.rid)

    // Switching explorations: until the new one is open, the open document is still the old one.
    if (openRid !== rid)
        return null

    return <Exploration rid={rid} />
}

function Exploration({ rid }: Props) {
    const [isDirty, isLegendVisible] = LineageExplorerSDK.useDocument(d => [d.isDirty, d.legend.isVisible])

    // The action reports its own failure; the task only drives the button's pending state.
    const [saveTask, withSaveTask] = useTask()

    const save = withSaveTask(() => LineageExplorerSDK.actions.exploration.save())

    return (
        <>
            <App.Background>
                <LineageCanvas />
            </App.Background>

            <App.Overlay>
                <App.Nav>
                    <App.Nav.Start>
                        <App.Nav.Icon glyph={lineageExplorerApp.glyph} />
                        <App.Nav.Rows>
                            <ResourceBreadcrumbs rid={rid} />
                        </App.Nav.Rows>
                    </App.Nav.Start>

                    <App.Nav.End>
                        <LineageBranchSelect />

                        <Button intent='primary' icon='floppy-disk' loading={saveTask.pending} disabled={!isDirty} onClick={save}>
                            Save
                        </Button>
                    </App.Nav.End>
                </App.Nav>

                <LineageToolbar />

                {isLegendVisible && <LineageLegend />}
            </App.Overlay>
        </>
    )
}
