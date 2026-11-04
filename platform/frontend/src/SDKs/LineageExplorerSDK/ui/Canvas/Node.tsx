import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { LineageExplorer } from '@quarry/shared/domain'
import { Button } from '@quarry/standard-ui/foundations/button'
import { cn } from '@quarry/standard-ui/utils/cn'
import { useTask } from '@/hooks/useTask'
import { LineageExplorerSDK } from '../../sdk'
import type { NodeDriver } from './drivers'

/** A resource's name, the node sized to it, with a button on each side to bring in its neighbours. */
export const ResourceNode = memo(function ResourceNode({ id, selected }: NodeProps<NodeDriver>) {
    const rid = id as LineageExplorer.Graph.Node.Rid

    const resource = LineageExplorerSDK.useDocument(d => d.selectors.node.get(d, rid).libraryResource)

    // The action reports its own failure; the task only drives the buttons' pending state.
    const [expandTask, withExpandTask] = useTask()

    const expandUpstream = withExpandTask(() => LineageExplorerSDK.actions.graph.expand(rid, 'upstream'))
    const expandDownstream = withExpandTask(() => LineageExplorerSDK.actions.graph.expand(rid, 'downstream'))

    return (
        <div
            className={cn(
                'flex max-w-80 min-w-32 items-center gap-1 rounded-sm border bg-card text-card-foreground shadow-xs',
                selected && 'border-primary',
            )}
        >
            <Handle type='target' position={Position.Left} isConnectable={false} className='opacity-0' />

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

            <Handle type='source' position={Position.Right} isConnectable={false} className='opacity-0' />
        </div>
    )
})
