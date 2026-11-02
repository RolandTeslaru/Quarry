import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Table } from '@quarry/standard-ui/foundations/table'
import { Tabs } from '@quarry/standard-ui/foundations/tabs'
import type { Library } from '@quarry/shared/domain'
import { App } from '@/AppKit'
import { AuditSDK } from '@/SDKs/AuditSDK/sdk'
import { LineageExplorerSDK } from '@/SDKs/LineageExplorerSDK/sdk'
import { ErrorNotice } from '@/components/ErrorNotice'
import { ResourceLink } from '@/components/ResourceLink'
import { dateTime } from '@/utils/format'
import { lineageExplorerApp } from '../definition'

/** The home's tabs: Recent is the default; All explorations lives in `?view=all`. */
type HomeView = 'recent' | 'all'

interface LineageExplorerSearch {
    view?: Exclude<HomeView, 'recent'>
}

export const Route = createFileRoute('/_workspace/lineage-explorer/')({
    validateSearch: (search: Record<string, unknown>): LineageExplorerSearch =>
        search.view === 'all' ? { view: 'all' } : {},
    component: LineageExplorerHome,
})

/** Lineage Explorer's home: the explorations you opened recently, newest first, or every one you can see. */
function LineageExplorerHome() {
    const navigate = useNavigate()
    const view: HomeView = Route.useSearch().view ?? 'recent'

    const [, [explorationsRequest]] = LineageExplorerSDK.useWith(
        () => null,
        query => [{ ...query.explorations, enabled: view === 'all' }],
    )

    const [, [recentsRequest]] = AuditSDK.useWith(
        () => null,
        query => [{ ...query.recents(lineageExplorerApp.id), enabled: view === 'recent' }],
    )

    const listRequest = view === 'all' ? explorationsRequest : recentsRequest

    const explorations: Library.Resource.Base[] = view === 'all'
        ? explorationsRequest.data?.explorations ?? []
        : (recentsRequest.data?.recents ?? []).map(recent => recent.resource)

    function openView(next: string) {
        void navigate({ to: '/lineage-explorer', search: next === 'all' ? { view: 'all' } : {} })
    }

    return (
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
                        <Tabs.List aria-label='Lineage Explorer home'>
                            <Tabs.Trigger value='recent'>Recent</Tabs.Trigger>
                            <Tabs.Trigger value='all'>All explorations</Tabs.Trigger>
                        </Tabs.List>
                        <Button
                            variant='minimal'
                            icon='refresh'
                            aria-label='Refresh'
                            loading={listRequest.isFetching}
                            onClick={() => void listRequest.refetch()}
                        />
                        <App.Home.Actions>
                            <Button intent='success' icon='add' onClick={() => LineageExplorerSDK.dialogs.openCreateExploration()}>
                                New exploration
                            </Button>
                        </App.Home.Actions>
                    </App.Home.Toolbar>

                    <div className='flex flex-col gap-3 px-6 py-5'>
                        <ErrorNotice error={listRequest.error} />

                        {listRequest.isPending && <Spinner className='size-6' role='status' aria-label='Loading' />}

                        {listRequest.isSuccess && explorations.length === 0 && (
                            <p className='text-sm text-muted-foreground'>
                                {view === 'all' ? 'No explorations yet. Start one with New exploration.' : 'Nothing opened yet. Explorations you open show up here.'}
                            </p>
                        )}

                        {explorations.length > 0 && <ExplorationsTable explorations={explorations} />}
                    </div>
                </Tabs.Root>
            </App.Home.Content>
        </App.Home.Root>
    )
}

interface ExplorationsTableProps {
    explorations: Library.Resource.Base[]
}

/** Explorations, and when they last changed — the same table for both tabs. */
function ExplorationsTable({ explorations }: ExplorationsTableProps) {
    return (
        <Table.Root>
            <Table.Header>
                <Table.Row>
                    <Table.Head>Name</Table.Head>
                    <Table.Head>Last updated</Table.Head>
                </Table.Row>
            </Table.Header>
            <Table.Body>
                {explorations.map(exploration => (
                    <Table.Row key={exploration.rid}>
                        <Table.Cell>
                            <ResourceLink resource={exploration} />
                        </Table.Cell>
                        <Table.Cell>{dateTime(exploration.updatedAt)}</Table.Cell>
                    </Table.Row>
                ))}
            </Table.Body>
        </Table.Root>
    )
}
