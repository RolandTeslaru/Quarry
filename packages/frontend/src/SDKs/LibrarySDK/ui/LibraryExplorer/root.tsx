import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Library } from '@quarry/shared/domain'

/** The open folder: a project or folder RID, or null for the workspace's projects. */
export type Cwd = Library.Resource.Rid | null

type LibraryExplorerContextValue = {
    cwd:                Cwd
    setCwd:             (cwd: Cwd) => void
    /** A non-container resource was chosen (opened, or picked in a picker). */
    onItemClick?:       (resource: Library.Resource.Base) => void
    isItemDisabled?:    (resource: Library.Resource.Base) => boolean
    searchQuery:        string
    setSearchQuery:     (value: string) => void
    treeSearchQuery:    string
    setTreeSearchQuery: (value: string) => void
}

const LibraryExplorerContext = createContext<LibraryExplorerContextValue | null>(null)

export function useLibraryExplorer() {
    const context = useContext(LibraryExplorerContext)

    if (!context)
        throw new Error('Library explorer parts must be rendered inside LibraryExplorer.Root')

    return context
}

interface Props {
    cwd:             Cwd
    setCwd:          (cwd: Cwd) => void
    onItemClick?:    (resource: Library.Resource.Base) => void
    isItemDisabled?: (resource: Library.Resource.Base) => boolean
    children:        ReactNode
}

/**
 * Holds what every part shares: the open folder (owned by the host — a route
 * param on the page, local state in a picker), what happens on a choice, and the
 * view's and tree's search text.
 */
export function Root({ cwd, setCwd, onItemClick, isItemDisabled, children }: Props) {
    const [searchQuery, setSearchQuery] = useState('')
    const [treeSearchQuery, setTreeSearchQuery] = useState('')

    // Opening another folder starts its search afresh.
    function openFolder(next: Cwd) {
        setSearchQuery('')
        setCwd(next)
    }

    const value: LibraryExplorerContextValue = {
        cwd,
        setCwd: openFolder,
        onItemClick,
        isItemDisabled,
        searchQuery,
        setSearchQuery,
        treeSearchQuery,
        setTreeSearchQuery,
    }

    return (
        <LibraryExplorerContext.Provider value={value}>
            {children}
        </LibraryExplorerContext.Provider>
    )
}

/** Case-insensitive name match; an empty query matches everything. */
export function matchesQuery(resource: Library.Resource.Base, query: string): boolean {
    const needle = query.trim().toLowerCase()

    return needle === '' || resource.name.toLowerCase().includes(needle)
}
