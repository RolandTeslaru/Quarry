import type { ReactNode } from 'react'
import { Input } from '@quarry/standard-ui/foundations/input'
import { cn } from '@quarry/standard-ui/utils/cn'
import { useLibraryExplorer } from '../root'

interface HeaderProps {
    className?: string
    children:   ReactNode
}

/** A bar pinned above the tree, usually holding its search. */
export function Header({ className, children }: HeaderProps) {
    return (
        <div className={cn('sticky top-0 z-10 flex items-center gap-2 border-b border-border surface px-3 py-2', className)}>
            {children}
        </div>
    )
}

interface SearchInputProps {
    className?: string
}

/** Filters the tree's loaded rows by name. */
export function SearchInput({ className }: SearchInputProps) {
    const { treeSearchQuery, setTreeSearchQuery } = useLibraryExplorer()

    return (
        <Input
            type='text'
            size='sm'
            value={treeSearchQuery}
            placeholder='Filter…'
            aria-label='Filter the tree'
            className={cn('flex-1', className)}
            onChange={event => setTreeSearchQuery(event.target.value)}
        />
    )
}
