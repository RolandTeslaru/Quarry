import { inputClasses } from '@quarry/standard-ui/foundations/input'
import { FolderIllustration, Icon } from '@quarry/standard-ui/icons'
import { cn } from '@quarry/standard-ui/utils/cn'
import type { Library } from '@quarry/shared/domain'
import { resourceIcon } from '@/components/ResourceLink'
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
 * LibraryRef field), looking like an input: shows the choice as its path —
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
            // An input's look — it stands in for one — opening the selector instead of taking text.
            className={cn(inputClasses(), 'flex cursor-pointer items-center gap-2 text-left', className)}
            onClick={open}
        >
            {chosen?.type === 'project' || chosen?.type === 'folder'
                ? <FolderIllustration color='var(--color-amber-400)' className='size-4 shrink-0' />
                : <Icon name={chosen ? resourceIcon(chosen.type) : 'folder-open'} className='shrink-0 text-muted-foreground' />}

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

            <Icon name='caret-down' className='shrink-0 text-muted-foreground' />
        </button>
    )
}
