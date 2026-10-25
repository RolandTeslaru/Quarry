import { Library } from '@quarry/shared/domain'
import { cn } from '@quarry/standard-ui/utils/cn'
import { ResourceIcon } from '@/components/ResourceIcon'

interface Props {
    resource: Library.Resource.Base
    disabled: boolean
    onOpen:   () => void
}

/**
 * One resource as a card: projects and folders as the yellow folder, anything
 * else as its owning app's glyph (bare — no tile). `data-library-*` mark it for a context menu.
 */
export function ItemCard({ resource, disabled, onOpen }: Props) {
    return (
        <button
            type='button'
            data-library-item={resource.type}
            data-library-rid={resource.rid}
            disabled={disabled}
            title={resource.description ?? resource.name}
            className={cn(
                'group flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-md p-2 text-center select-none',
                'hover:bg-muted disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent',
            )}
            onClick={onOpen}
        >
            <ItemMark resource={resource} />
            <span className='w-full truncate text-sm font-medium'>{resource.name}</span>
            <span className='text-xs text-muted-foreground capitalize'>{resource.type}</span>
        </button>
    )
}

interface ItemMarkProps {
    resource: Library.Resource.Base
}

function ItemMark({ resource }: ItemMarkProps) {
    return <ResourceIcon type={resource.type} size='lg' />
}
