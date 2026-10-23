import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Tabs } from '@quarry/standard-ui/foundations/tabs'
import type { Library } from '@quarry/shared/domain'
import { App } from '@/AppKit'
import { LibraryExplorer } from '@/SDKs/LibrarySDK/ui/LibraryExplorer'
import { Empty } from '@/components/Empty'
import { resourceRoute } from '@/shell/apps'
import { LibraryExplorerApp, type LibraryTab } from '../components/LibraryExplorerApp'
import { ProjectCards } from '../components/ProjectCards'

/** The home's tabs: Projects is the default; Recents lives in `?view=recents`. */
type HomeView = 'projects' | 'recents'

interface LibrarySearch {
    /** A section of the explorer other than Files (Cloud, Trash); absent means the home. */
    tab?:  Exclude<LibraryTab, 'files'>
    view?: Exclude<HomeView, 'projects'>
}

export const Route = createFileRoute('/_workspace/library/')({
    validateSearch: (search: Record<string, unknown>): LibrarySearch => {
        if (search.tab === 'cloud' || search.tab === 'trash')
            return { tab: search.tab }

        if (search.view === 'recents')
            return { view: search.view }

        return {}
    },
    component: LibraryRoute,
})

function LibraryRoute() {
    const { tab, view } = Route.useSearch()

    if (tab)
        return <LibraryExplorerApp cwd={null} tab={tab} />

    return <LibraryHome view={view ?? 'projects'} />
}

interface LibraryHomeProps {
    view: HomeView
}

/** The Library's home: every project you can see, and — a tab away — what you opened recently. */
function LibraryHome({ view }: LibraryHomeProps) {
    const navigate = useNavigate()

    function openProject(rid: Library.Resource.Rid | null) {
        if (rid)
            void navigate({ to: '/library/$rid', params: { rid } })
    }

    function openItem(resource: Library.Resource.Base) {
        void navigate(resourceRoute(resource.type, resource.rid))
    }

    function openView(next: string) {
        void navigate({ to: '/library', search: next === 'recents' ? { view: 'recents' } : {} })
    }

    return (
        <LibraryExplorer.Root cwd={null} setCwd={openProject} onItemClick={openItem}>
            <App.Home.Root>
                <App.Home.Header>
                    <App.Home.Logo />
                    <App.Home.PreTitle />
                    <App.Home.Title />
                    <App.Home.TitleDescription />
                </App.Home.Header>

                <App.Home.Content>
                    <Tabs.Root value={view} onValueChange={openView} className='gap-0'>
                        <App.Home.Toolbar>
                            <Tabs.List aria-label='Library home'>
                                <Tabs.Trigger value='projects'>Projects</Tabs.Trigger>
                                <Tabs.Trigger value='recents'>Recents</Tabs.Trigger>
                            </Tabs.List>
                            {view === 'projects' && <LibraryExplorer.View.SearchInput className='ml-auto w-56' />}
                            <App.Home.Actions className={view === 'projects' ? 'ml-0' : undefined}>
                                <LibraryExplorer.View.CreateBtn />
                            </App.Home.Actions>
                        </App.Home.Toolbar>

                        <Tabs.Content value='projects'>
                            <ProjectCards className='p-6' />
                        </Tabs.Content>

                        <Tabs.Content value='recents'>
                            {/* Filled from audit's open events (docs/design/audit.md §5) once they're recorded. */}
                            <div className='p-6'>
                                <Empty
                                    icon='history'
                                    title='Nothing opened yet'
                                    description='Projects, folders and files you open will show up here, newest first.'
                                />
                            </div>
                        </Tabs.Content>
                    </Tabs.Root>
                </App.Home.Content>
            </App.Home.Root>
        </LibraryExplorer.Root>
    )
}
