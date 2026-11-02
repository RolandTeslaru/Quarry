import { memo } from 'react'
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import { Button } from '@quarry/standard-ui/foundations/button'
import { cn } from '@quarry/standard-ui/utils/cn'
import { ResourceIcon } from '@/components/ResourceIcon'
import { useExpand } from './context'
import { NODE_HEIGHT, NODE_WIDTH, type ResourceNode as ResourceNodeType } from './graph'

/** A resource: its mark and name, with a button on each side to bring in its neighbours. */
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
                'flex items-center gap-1 rounded-md border bg-card px-1 text-card-foreground shadow-sm',
                selected && 'border-primary',
            )}
            style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
        >
            <Handle type='target' position={Position.Left} isConnectable={false} className='opacity-0' />

            <Button
                variant='minimal'
                icon='chevron-left'
                aria-label={`Expand what feeds ${data.resource.name}`}
                className='nodrag'
                onClick={() => expandTowards('upstream')}
            />

            <ResourceIcon type={data.resource.type} size='sm' className='shrink-0' />

            <div className='min-w-0 flex-1'>
                <p className='truncate text-xs font-semibold' title={data.resource.name}>{data.resource.name}</p>
                <p className='truncate text-xs text-muted-foreground capitalize'>{data.resource.type}</p>
            </div>

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
