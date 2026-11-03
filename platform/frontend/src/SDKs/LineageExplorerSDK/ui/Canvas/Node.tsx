import { memo } from 'react'
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import { Button } from '@quarry/standard-ui/foundations/button'
import { cn } from '@quarry/standard-ui/utils/cn'
import { useExpand } from './context'
import type { ResourceNode as ResourceNodeType } from './graph'

/** A resource's name, the node sized to it, with a button on each side to bring in its neighbours. */
export const ResourceNode = memo(function ResourceNode({ id, data, selected }: NodeProps<ResourceNodeType>) {
    const reactFlow = useReactFlow<ResourceNodeType>()
    const expand = useExpand()

    function expandTowards(direction: 'upstream' | 'downstream') {
        const node = reactFlow.getNode(id)

        if (node)
            expand(node, direction)
    }

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
                aria-label={`Expand what feeds ${data.resource.name}`}
                className='nodrag'
                onClick={() => expandTowards('upstream')}
            />

            <p className='min-w-0 flex-1 truncate text-xs font-semibold' title={data.resource.name}>
                {data.resource.name}
            </p>

            <Button
                variant='minimal'
                icon='chevron-right'
                aria-label={`Expand what ${data.resource.name} feeds`}
                className='nodrag'
                onClick={() => expandTowards('downstream')}
            />

            <Handle type='source' position={Position.Right} isConnectable={false} className='opacity-0' />
        </div>
    )
})
