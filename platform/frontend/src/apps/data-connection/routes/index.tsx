import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Table } from '@quarry/standard-ui/foundations/table'
import { Tabs } from '@quarry/standard-ui/foundations/tabs'
import type { DataConnection } from '@quarry/shared/domain'
import { App } from '@/AppKit'
import { AuditSDK } from '@/SDKs/AuditSDK/sdk'
import { DataConnectionSDK } from '@/SDKs/DataConnectionSDK/sdk'
import { ErrorNotice } from '@/components/ErrorNotice'
import { ResourceLink } from '@/components/ResourceLink'
import { dateTime } from '@/utils/format'

/** The home's tabs: Recent is the default; All sources lives in `?view=all`. */
type HomeView = 'recent' | 'all'

interface DataConnectionSearch {
    view?: Exclude<HomeView, 'recent'>
}

export const Route = createFileRoute('/_workspace/data-connection/')({
    validateSearch: (search: Record<string, unknown>): DataConnectionSearch =>
        search.view === 'all' ? { view: 'all' } : {},
    component: DataConnectionHome,
})

/**
 * Data Connection's home: one sources table, two tabs — the ones you opened
 * recently, newest first, or every one you can see.
 */
function DataConnectionHome() {
    const navigate = useNavigate()
    const view: HomeView = Route.useSearch().view ?? 'recent'

    const [definitions, [sourcesRequest, definitionsRequest]] = DataConnectionSDK.useWith(
        state => state.definitions,
        query => [query.sources, query.definitions],
    )

    const [, [recentsRequest]] = AuditSDK.useWith(
        () => null,
        query => [{ ...query.recents('data-connection'), enabled: view === 'recent' }],
    )

    const all = sourcesRequest.data?.sources ?? []

    // Recents are library rows; the table needs the sources themselves (their type) — by rid.
    const sourceByRid = Object.fromEntries(all.map(source => [source.rid, source]))

    const sources = view === 'all'
        ? all
        : (recentsRequest.data?.recents ?? []).flatMap(recent => sourceByRid[recent.resource.rid] ?? [])

    // The open tab's list.
    const listRequest = view === 'all' ? sourcesRequest : recentsRequest
    const pending = listRequest.isPending || sourcesRequest.isPending
    const loaded = listRequest.isSuccess && sourcesRequest.isSuccess

    function openView(next: string) {
        void navigate({ to: '/data-connection', search: next === 'all' ? { view: 'all' } : {} })
    }

    function refresh() {
        void sourcesRequest.refetch()

        if (view === 'recent')
            void recentsRequest.refetch()
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
                        <Tabs.List aria-label='Data Connection home'>
                            <Tabs.Trigger value='recent'>Recent</Tabs.Trigger>
                            <Tabs.Trigger value='all'>All sources</Tabs.Trigger>
                        </Tabs.List>
                        <Button
                            variant='minimal'
                            icon='refresh'
                            aria-label='Refresh'
                            loading={listRequest.isFetching || sourcesRequest.isFetching}
                            onClick={refresh}
                        />
                        <App.Home.Actions>
                            <Button intent='success' icon='add' onClick={() => DataConnectionSDK.dialogs.openCreateSource()}>
                                New source
                            </Button>
                        </App.Home.Actions>
                    </App.Home.Toolbar>

                    <div className='flex flex-col gap-3 px-6 py-5'>
                        <ErrorNotice error={listRequest.error ?? sourcesRequest.error ?? definitionsRequest.error} />

                        {pending && <Spinner className='size-6' role='status' aria-label='Loading' />}

                        {loaded && sources.length === 0 && (
                            <p className='text-sm text-muted-foreground'>
                                {view === 'all' ? 'No sources yet. Connect one with New source.' : 'Nothing opened yet. Sources you open show up here.'}
                            </p>
                        )}

                        {sources.length > 0 && <SourcesTable sources={sources} definitions={definitions} />}
                    </div>
                </Tabs.Root>
            </App.Home.Content>
        </App.Home.Root>
    )
}

interface SourcesTableProps {
    sources:     DataConnection.Source.Schema[]
    definitions: DataConnectionSDK.State['definitions']
}

/** Sources, with their source type and when they last changed — the same table for both tabs. */
function SourcesTable({ sources, definitions }: SourcesTableProps) {
    return (
        <Table.Root>
            <Table.Header>
                <Table.Row>
                    <Table.Head>Name</Table.Head>
                    <Table.Head>Source type</Table.Head>
                    <Table.Head>Last updated</Table.Head>
                </Table.Row>
            </Table.Header>
            <Table.Body>
                {sources.map(source => (
                    <Table.Row key={source.rid}>
                        <Table.Cell>
                            <ResourceLink resource={source} />
                        </Table.Cell>
                        <Table.Cell>{definitions[source.definitionId]?.displayName ?? source.definitionId}</Table.Cell>
                        <Table.Cell>{dateTime(source.updatedAt)}</Table.Cell>
                    </Table.Row>
                ))}
            </Table.Body>
        </Table.Root>
    )
}
