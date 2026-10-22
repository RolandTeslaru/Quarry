import { Fragment, type ReactNode } from 'react'
import { Breadcrumb } from '@quarry/standard-ui/foundations/breadcrumb'
import { Input } from '@quarry/standard-ui/foundations/input'
import { cn } from '@quarry/standard-ui/utils/cn'
import { LibrarySDK } from '../../../sdk'
import { useLibraryExplorer } from '../root'

interface HeaderProps {
    className?: string
    children:   ReactNode
}

/** A bar above the view: usually its search and the "New" button. */
export function Header({ className, children }: HeaderProps) {
    return (
        <div className={cn('flex items-center gap-2', className)}>
            {children}
        </div>
    )
}

interface BreadcrumbsProps {
    /** `sm` for tight spots like an app header. */
    size?:      'default' | 'sm'
    className?: string
}

/** "Library › project › folder": every step opens that folder; the last is the open one. */
export function Breadcrumbs({ size = 'default', className }: BreadcrumbsProps) {
    const { cwd, setCwd } = useLibraryExplorer()

    const [path] = LibrarySDK.useWith(
        state => (cwd ? LibrarySDK.selectors.path(state, cwd) : []),
        query => (cwd ? [query.path(cwd)] : []),
    )

    const ancestors = path.slice(0, -1)
    const current = path.at(-1)

    return (
        <Breadcrumb.Root className={cn('min-w-0', className)}>
            <Breadcrumb.List className={cn('flex-nowrap', size === 'sm' && 'text-xs')}>
                <Breadcrumb.Item>
                    {cwd === null
                        ? <Breadcrumb.Page className='font-semibold text-foreground'>Library</Breadcrumb.Page>
                        : <StepButton label='Library' onClick={() => setCwd(null)} />}
                </Breadcrumb.Item>

                {ancestors.map(ancestor => (
                    <Fragment key={ancestor.rid}>
                        <Breadcrumb.Separator />
                        <Breadcrumb.Item>
                            <StepButton label={ancestor.name} onClick={() => setCwd(ancestor.rid)} />
                        </Breadcrumb.Item>
                    </Fragment>
                ))}

                {current && (
                    <>
                        <Breadcrumb.Separator />
                        <Breadcrumb.Item>
                            <Breadcrumb.Page className='truncate font-semibold text-foreground'>{current.name}</Breadcrumb.Page>
                        </Breadcrumb.Item>
                    </>
                )}
            </Breadcrumb.List>
        </Breadcrumb.Root>
    )
}

interface StepButtonProps {
    label:   string
    onClick: () => void
}

function StepButton({ label, onClick }: StepButtonProps) {
    return (
        <button type='button' className='cursor-pointer truncate hover:text-foreground' onClick={onClick}>
            {label}
        </button>
    )
}

interface SearchInputProps {
    className?: string
}

/** Filters the open folder's items by name. Opening another folder clears it (Root). */
export function SearchInput({ className }: SearchInputProps) {
    const { cwd, searchQuery, setSearchQuery } = useLibraryExplorer()

    return (
        <Input
            type='text'
            size='sm'
            value={searchQuery}
            placeholder={cwd ? 'Search this folder…' : 'Search projects…'}
            aria-label='Search items'
            className={className}
            onChange={event => setSearchQuery(event.target.value)}
        />
    )
}
