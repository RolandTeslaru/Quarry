import { selectTriggerClasses } from '@quarry/standard-ui/foundations/select'
import { Icon } from '@quarry/standard-ui/icons'
import { cn } from '@quarry/standard-ui/utils/cn'
import type { Library } from '@quarry/shared/domain'
import { ResourceIcon } from '@/components/ResourceIcon'
import { LibrarySDK } from '../sdk'
import type { LibrarySelector } from '../dialogs/library-selector-dialog'

interface Props {
    /** The chosen resource, or none yet. */
    value:        Library.Resource.Rid | null
    onChange:     (resource: Library.Resource.Base) => void
    /** What may be chosen — passed to the selector. */
    accept:       LibrarySelector.Accept | readonly LibrarySelector.Accept[]
    /** Shown while nothing is chosen. */
    placeholder?: string
    id?:          string
    disabled?:    boolean
    className?:   string
}

/**
 * A form field for choosing a Library resource (after PretzelGraph's
 * LibraryRef field), looking like a select: shows the choice as its path —
 * "Project / Folder / Name" — and opens the Library selector to change it,
 * starting where the current choice is.
 *
 *   <ResourceInput value={parentRid} onChange={folder => setParentRid(folder.rid)} accept={['project', 'folder']} />
 */
export function ResourceInput({ value, onChange, accept, placeholder = 'Select…', id, disabled, className }: Props) {
    const [path] = LibrarySDK.useWith(
        state => (value ? LibrarySDK.selectors.path(state, value) : []),
        query => (value ? [query.path(value)] : []),
    )

    const chosen = path.at(-1)

    function open() {
        LibrarySDK.dialogs.openLibrarySelector({
            accept,
            // A container opens on itself; anything else, on its folder.
            initialCwd: chosen && (chosen.type === 'project' || chosen.type === 'folder') ? chosen.rid : chosen?.parentRid ?? undefined,
            onSelect:   onChange,
        })
    }

    return (
        <button
            id={id}
            type='button'
            disabled={disabled}
            // A select's look — it stands in for one — opening the Library selector instead of a list.
            data-size='default'
            className={cn(selectTriggerClasses(), 'text-left', className)}
            onClick={open}
        >
            {chosen
                ? <ResourceIcon type={chosen.type} />
                : <Icon name='folder-open' className='shrink-0 text-muted-foreground' />}

            {/* The path, root first: the ancestors muted, the choice itself in full. */}
            <span className='min-w-0 flex-1 truncate'>
                {chosen
                    ? path.map((resource, index) => (
                        <span key={resource.rid}>
                            {index > 0 && <span className='text-muted-foreground'> / </span>}
                            <span className={index === path.length - 1 ? 'text-foreground' : 'text-muted-foreground'}>
                                {resource.name}
                            </span>
                        </span>
                    ))
                    : <span className='text-muted-foreground'>{placeholder}</span>}
            </span>

            <Icon name='chevron-down' className='size-4 opacity-50' />
        </button>
    )
}
