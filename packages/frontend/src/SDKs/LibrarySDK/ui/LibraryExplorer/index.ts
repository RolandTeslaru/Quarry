import { Root } from './root'
import { Content as TreeContent } from './Tree/content'
import { Header as TreeHeader, SearchInput as TreeSearchInput } from './Tree/header'
import { Content as ViewContent, ContentSkeleton } from './View/content'
import { Breadcrumbs, Header as ViewHeader, SearchInput as ViewSearchInput } from './View/breadcrumbs'
import { CreateBtn } from './View/create-button'

export { matchesQuery, useLibraryExplorer, type Cwd } from './root'
export { LibraryContextMenu } from './context-menus'

/**
 * The Library as composable parts (after PretzelGraph's LibraryBrowser): a Root
 * holding the open folder, a folder Tree, and a View of the open folder. The
 * Library Explorer app arranges them on AppKit; a picker can reuse them.
 */
export const LibraryExplorer = {
    Root,
    Tree: Object.assign(TreeContent, {
        Header:      TreeHeader,
        SearchInput: TreeSearchInput,
    }),
    View: Object.assign(ViewContent, {
        Header:      ViewHeader,
        Breadcrumbs,
        SearchInput: ViewSearchInput,
        CreateBtn,
        Skeleton:    ContentSkeleton,
    }),
}
