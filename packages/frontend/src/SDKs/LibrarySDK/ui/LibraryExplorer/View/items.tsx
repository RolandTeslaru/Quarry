import { Library } from '@quarry/shared/domain'
import { FolderIllustration, Icon } from '@quarry/standard-ui/icons'
import { cn } from '@quarry/standard-ui/utils/cn'
import { App } from '@/AppKit'
import { resourceIcon } from '@/components/ResourceLink'
import { resourceGlyph } from '@/shell/apps'

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
    if (Library.Resource.CONTAINERS.includes(resource.type))
        return <FolderIllustration color='var(--color-amber-400)' className='size-16' />

    const glyph = resourceGlyph(resource.type)

    if (glyph)
        return <App.Glyph glyph={glyph} size={52} bare className='size-16' />

    return (
        <span className='grid size-16 place-items-center text-muted-foreground'>
            <Icon name={resourceIcon(resource.type)} size={28} />
        </span>
    )
}
