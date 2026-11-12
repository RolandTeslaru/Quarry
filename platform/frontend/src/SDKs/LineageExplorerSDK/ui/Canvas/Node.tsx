import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { LineageExplorer } from '@quarry/shared/domain'
import { Button } from '@quarry/standard-ui/foundations/button'
import { cn } from '@quarry/standard-ui/utils/cn'
import { useTask } from '@/hooks/useTask'
import { LineageExplorerSDK } from '../../sdk'
import { LEGENDS } from '../Legend/legends'
import { useStaleness } from '../Legend/useStaleness'
import type { NodeDriver } from './drivers'

const HANDLE_CLASS = 'size-0! min-h-0! min-w-0! border-0! opacity-0'

/** A resource's name on its legend colour, the node sized to it, with a button on each side to bring in its neighbours. */
export const ResourceNode = memo(function ResourceNode({ id, selected }: NodeProps<NodeDriver>) {
    const rid = id as LineageExplorer.Graph.Node.Rid

    const stalenessRequest = useStaleness()

    const [resource, tint] = LineageExplorerSDK.useDocument(d => {
        const resource = d.selectors.node.get(d, rid).libraryResource

        return [resource, LEGENDS[d.legend.type].getTint(resource, stalenessRequest.data?.staleness)]
    })

    // The action reports its own failure; the task only drives the buttons' pending state.
    const [expandTask, withExpandTask] = useTask()

    const expandUpstream = withExpandTask(() => LineageExplorerSDK.actions.graph.expand(rid, 'upstream'))
    const expandDownstream = withExpandTask(() => LineageExplorerSDK.actions.graph.expand(rid, 'downstream'))

    return (
        <div
            className={cn(
                'flex max-w-80 min-w-32 items-center gap-1 rounded-sm border text-card-foreground shadow-xs',
                selected && 'border-primary',
            )}
            // The legend colour, softened over the card so the name stays readable in either theme.
            style={{ backgroundColor: `color-mix(in oklab, var(${tint}) 30%, var(--card))` }}
        >
            {/* No size: an edge ends at a handle's outer side, so a sized one leaves a gap before the border. Important beats React Flow's unlayered CSS. */}
            <Handle type='target' position={Position.Left} isConnectable={false} className={HANDLE_CLASS} />

            <Button
                variant='minimal'
                icon='chevron-left'
                aria-label={`Expand what feeds ${resource.name}`}
                className='nodrag'
                disabled={expandTask.pending}
                onClick={expandUpstream}
            />

            <p className='min-w-0 flex-1 truncate text-xs font-semibold' title={resource.name}>
                {resource.name}
            </p>

            <Button
                variant='minimal'
                icon='chevron-right'
                aria-label={`Expand what ${resource.name} feeds`}
                className='nodrag'
                disabled={expandTask.pending}
                onClick={expandDownstream}
            />

            <Handle type='source' position={Position.Right} isConnectable={false} className={HANDLE_CLASS} />
        </div>
    )
})
