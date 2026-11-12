import { useStoreWithEqualityFn } from 'zustand/traditional'
import { shallow } from 'zustand/shallow'
import { App } from '@/AppKit'
import { LineageExplorerSDK } from '../../sdk'

/** The canvas's tools, under the nav: adding, arranging, undo and redo, how edges are drawn, and the legend. */
export function LineageToolbar() {
    const [isEmpty, isLegendVisible, edgeType] = LineageExplorerSDK.useDocument(d => [
        d.selectors.node.getCount(d) === 0,
        d.legend.isVisible,
        d.edgeType,
    ])
    // Shallow, as the SDK's own store compares: a plain useStore would see a new array each time.
    const [canUndo, canRedo] = useStoreWithEqualityFn(LineageExplorerSDK.history, history => [
        history.pastStates.length > 0,
        history.futureStates.length > 0,
    ], shallow)

    return (
        <App.Toolbar.Root aria-label='Canvas tools'>
            <App.Toolbar.Item icon='plus' label='Add' onClick={() => LineageExplorerSDK.actions.graph.openAddResource()} />
            <App.Toolbar.Item icon='layout-auto' label='Layout' disabled={isEmpty} onClick={() => LineageExplorerSDK.actions.graph.arrange()} />
            <App.Toolbar.Group label='Undo/redo'>
                <App.Toolbar.Button icon='undo' label='Undo' disabled={!canUndo} onClick={() => LineageExplorerSDK.actions.history.undo()} />
                <App.Toolbar.Button icon='redo' label='Redo' disabled={!canRedo} onClick={() => LineageExplorerSDK.actions.history.redo()} />
            </App.Toolbar.Group>
            <App.Toolbar.Group label='Edges'>
                <App.Toolbar.Button
                    icon='curved-range-chart'
                    label='Bezier edges'
                    active={edgeType === 'bezier'}
                    onClick={() => LineageExplorerSDK.actions.graph.setEdgeType('bezier')}
                />
                <App.Toolbar.Button
                    icon='one-to-one'
                    label='Floating edges'
                    active={edgeType === 'floating'}
                    onClick={() => LineageExplorerSDK.actions.graph.setEdgeType('floating')}
                />
            </App.Toolbar.Group>
            <App.Toolbar.Item
                icon='eye-open'
                label='Legend'
                active={isLegendVisible}
                onClick={() => LineageExplorerSDK.actions.legend.toggle()}
            />
        </App.Toolbar.Root>
    )
}
