import { Button } from '@quarry/standard-ui/foundations/button'
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
 * LibraryRef field): shows the choice — its name, where it sits — and opens the
 * Library selector to change it, starting where the current choice is.
 *
 *   <ResourceInput value={parentRid} onChange={folder => setParentRid(folder.rid)} accept={['project', 'folder']} />
 */
export function ResourceInput({ value, onChange, accept, placeholder = 'Select…', id, disabled, className }: Props) {
    const [path] = LibrarySDK.useWith(
        state => (value ? LibrarySDK.selectors.path(state, value) : []),
        query => (value ? [query.path(value)] : []),
    )

    const chosen = path.at(-1)
    const location = path.slice(0, -1).map(ancestor => ancestor.name).join(' / ')

    function open() {
        LibrarySDK.dialogs.openLibrarySelector({
            accept,
            // A container opens on itself; anything else, on its folder.
            initialCwd: chosen && (chosen.type === 'project' || chosen.type === 'folder') ? chosen.rid : chosen?.parentRid ?? undefined,
            onSelect:   onChange,
        })
    }

    return (
        <Button
            id={id}
            type='button'
            variant='outlined'
            disabled={disabled}
            className={cn('h-auto min-h-9 w-full justify-start px-2.5 py-1.5 text-left font-normal', className)}
            onClick={open}
        >
            {chosen?.type === 'project' || chosen?.type === 'folder'
                ? <FolderIllustration color='var(--color-amber-400)' className='size-5 shrink-0' />
                : <Icon name={chosen ? resourceIcon(chosen.type) : 'folder-open'} className='shrink-0 text-muted-foreground' />}

            <span className='flex min-w-0 flex-col'>
                <span className={cn('truncate text-sm', chosen ? 'text-foreground' : 'text-muted-foreground')}>
                    {chosen?.name ?? placeholder}
                </span>
                {location && <span className='truncate text-xs text-muted-foreground'>{location}</span>}
            </span>

            <Icon name='caret-down' className='ml-auto shrink-0 text-muted-foreground' />
        </Button>
    )
}
