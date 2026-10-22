import { createFileRoute } from '@tanstack/react-router'
import { LibraryExplorerApp, type LibraryTab } from '@/apps/library/LibraryExplorerApp'

interface LibrarySearch {
    /** A section other than Files; absent means Files. */
    tab?: Exclude<LibraryTab, 'files'>
}

export const Route = createFileRoute('/_workspace/library')({
    validateSearch: (search: Record<string, unknown>): LibrarySearch => {
        if (search.tab === 'cloud' || search.tab === 'trash')
            return { tab: search.tab }

        return {}
    },
    component: LibraryRoute,
})

function LibraryRoute() {
    const { tab } = Route.useSearch()

    return <LibraryExplorerApp cwd={null} tab={tab ?? 'files'} />
}
