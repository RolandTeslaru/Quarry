import { useNavigate } from '@tanstack/react-router'
import type { Library } from '@quarry/shared/domain'
import { App } from '@/AppKit'
import { LibraryExplorer, type Cwd } from '@/SDKs/LibrarySDK/ui/LibraryExplorer'
import { Empty } from '@/components/Empty'
import { resourceRoute } from '@/shell/apps'
import { libraryApp } from './definition'
import { ProjectCards } from './ProjectCards'

/** The app's sections, chosen in the left nav. Files is the default; the others live in `?tab=`. */
export type LibraryTab = 'files' | 'cloud' | 'trash'

interface Props {
    /** The open folder from the URL: a project or folder, or null for the projects. */
    cwd: Cwd
    tab: LibraryTab
}

/**
 * The Library Explorer: Files (the tree in the left sidebar; the projects as
 * cards, or the open folder's items, in the content), Cloud (not built yet)
 * and Trash.
 */
export function LibraryExplorerApp({ cwd, tab }: Props) {
    const navigate = useNavigate()

    function openFolder(next: Cwd) {
        if (next === null) {
            void navigate({ to: '/library' })

            return
        }

        void navigate({ to: '/library/$rid', params: { rid: next } })
    }

    function openItem(resource: Library.Resource.Base) {
        void navigate(resourceRoute(resource.type, resource.rid))
    }

    function openTab(next: LibraryTab) {
        if (next === 'files') {
            void navigate({ to: '/library' })

            return
        }

        void navigate({ to: '/library', search: { tab: next } })
    }

    return (
        <LibraryExplorer.Root cwd={cwd} setCwd={openFolder} onItemClick={openItem}>
            <App.Root>
                <App.Header>
                    <App.Header.Icon glyph={libraryApp.glyph} />
                    <App.Header.Rows>
                        {tab === 'files' && <LibraryExplorer.View.Breadcrumbs size='sm' />}
                        {tab === 'cloud' && <App.Header.Title>Cloud</App.Header.Title>}
                        {tab === 'trash' && <App.Header.Title>Trash</App.Header.Title>}
                    </App.Header.Rows>
                    <App.Header.Actions>
                        {tab === 'files' && <LibraryExplorer.View.SearchInput className='w-64' />}
                        {tab === 'files' && <LibraryExplorer.View.CreateBtn />}
                    </App.Header.Actions>
                </App.Header>

                <App.LeftNav>
                    <App.LeftNav.Item
                        icon='folder-close'
                        label='Files'
                        active={tab === 'files'}
                        onSelect={() => openTab('files')}
                    />
                    <App.LeftNav.Item
                        icon='cloud'
                        label='Cloud — coming soon'
                        active={tab === 'cloud'}
                        disabled
                        onSelect={() => openTab('cloud')}
                    />
                    <App.LeftNav.Item
                        icon='trash'
                        label='Trash'
                        active={tab === 'trash'}
                        onSelect={() => openTab('trash')}
                    />
                </App.LeftNav>

                {tab === 'files' && (
                    <App.LeftSidebar className='flex w-72 flex-col'>
                        <LibraryExplorer.Tree.Header>
                            <LibraryExplorer.Tree.SearchInput />
                        </LibraryExplorer.Tree.Header>
                        <LibraryExplorer.Tree className='px-2' />
                    </App.LeftSidebar>
                )}

                <App.Content>
                    {tab === 'files' && <FilesTab cwd={cwd} />}
                    {tab === 'cloud' && <PlaceholderTab icon='cloud' title='Cloud is coming' />}
                    {tab === 'trash' && <PlaceholderTab icon='trash' title='Trash' />}
                </App.Content>
            </App.Root>
        </LibraryExplorer.Root>
    )
}

interface FilesTabProps {
    cwd: Cwd
}

/** The projects as cards; inside a project, the open folder's items. */
function FilesTab({ cwd }: FilesTabProps) {
    if (cwd === null)
        return <ProjectCards className='p-6' />

    return <LibraryExplorer.View className='p-6' />
}

interface PlaceholderTabProps {
    icon:  'cloud' | 'trash'
    title: string
}

/** A section that isn't built yet. Trash needs an endpoint listing trashed resources (and one restoring them). */
function PlaceholderTab({ icon, title }: PlaceholderTabProps) {
    const description = icon === 'trash'
        ? 'Trashed projects, folders and datasets will be listed here, ready to restore.'
        : 'Files from cloud storage will show up here.'

    return (
        <div className='p-6'>
            <Empty icon={icon} title={title} description={description} />
        </div>
    )
}
