import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@quarry/standard-ui/foundations/button'
import { SearchInput } from '@quarry/standard-ui/foundations/searchInput'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Tabs } from '@quarry/standard-ui/foundations/tabs'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import type { DataConnection, Library } from '@quarry/shared/domain'
import { App } from '@/AppKit'
import { DataConnectionSDK } from '@/SDKs/DataConnectionSDK/sdk'
import { SourceTableTree } from '@/SDKs/DataConnectionSDK/ui/SourceTableTree'
import { SourceTablePreview } from '@/SDKs/DataConnectionSDK/ui/SourceTablePreview'
import { SyncPanel } from '@/SDKs/DataConnectionSDK/ui/SyncPanel'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import { Detail, Details } from '@/components/Details'
import { Empty } from '@/components/Empty'
import { ErrorNotice } from '@/components/ErrorNotice'
import { ResourceBreadcrumbs } from '@/components/ResourceBreadcrumbs'
import { ResourceIcon } from '@/components/ResourceIcon'
import { useTask } from '@/hooks/useTask'
import { dateTime } from '@/utils/format'
import { dataConnectionApp } from '../definition'

interface Props {
    rid:   DataConnection.Source.Rid
    /** The table open in the content (the route's search); none shows the syncs. */
    table: DataConnection.Source.Table | null
}

/**
 * The Data Connection app on one source, laid out like the dataset viewer: the
 * source's details and its tables in the left sidebar; the content shows the
 * table picked there, live, in the same table viewer as a dataset — or, with
 * none picked, the source's syncs and runs.
 */
export function SourceApp({ rid, table }: Props) {
    const [source, [sourceRequest]] = DataConnectionSDK.useWith(
        state => state.sources[rid],
        query => [query.source(rid)],
    )

    const [definition, [definitionsRequest]] = DataConnectionSDK.useWith(
        state => source && state.definitions[source.definitionId],
        query => [query.definitions],
    )

    const [task, withTask] = useTask()

    const testConnection = withTask(async () => {
        const result = await DataConnectionSDK.actions.source.test(rid)

        if (result.ok)
            NotificationSDK.toast.success('Connection successful', { description: 'The source can be reached with the configured credential.' })
        else
            NotificationSDK.toast.error('Connection failed', { description: result.error })
    })

    function createSync(from?: DataConnection.Source.Table) {
        if (source && definition)
            DataConnectionSDK.dialogs.openCreateSync({ source, definition, table: from })
    }

    const canExplore = definition?.capabilities.explore ?? false

    return (
        <>
            <App.Navbar>
                <App.Navbar.Icon glyph={dataConnectionApp.glyph} />
                <App.Navbar.Rows>
                    <ResourceBreadcrumbs rid={rid} />
                </App.Navbar.Rows>

                <App.Navbar.Actions>
                    <Button icon='link' loading={task.pending} disabled={!source} onClick={testConnection}>
                        Test connection
                    </Button>
                    <Button intent='primary' icon='add' disabled={!definition} onClick={() => createSync()}>
                        Create sync
                    </Button>
                </App.Navbar.Actions>
            </App.Navbar>

            <App.LeftSidebar className='w-96'>
                <div className='flex items-start gap-2 px-4 py-3'>
                    <ResourceIcon type='source' size='xs' className='mt-px' />
                    <h2 className='text-xs font-semibold break-all'>{source?.name ?? ''}</h2>
                </div>

                <Tabs.Root defaultValue={table ? 'explore' : 'about'} className='px-4'>
                    <Tabs.List className='w-full' aria-label='Source details'>
                        <Tabs.Trigger value='about' className='flex-1'>About</Tabs.Trigger>
                        {canExplore && <Tabs.Trigger value='explore' className='flex-1'>Explore</Tabs.Trigger>}
                    </Tabs.List>

                    <Tabs.Content value='about'>
                        {source && <AboutPanel source={source} definition={definition} />}
                    </Tabs.Content>

                    {canExplore && (
                        <Tabs.Content value='explore'>
                            <ExplorePanel rid={rid} selected={table} />
                        </Tabs.Content>
                    )}
                </Tabs.Root>
            </App.LeftSidebar>

            <App.Content>
                {table
                    ? <TableContent rid={rid} table={table} onCreateSync={() => createSync(table)} canCreateSync={!!definition} />
                    : (
                        <>
                            <App.Content.Toolbar>
                                <span className='text-sm font-medium'>Syncs &amp; runs</span>
                                <span className='text-xs text-muted-foreground'>Copy a table or query into a versioned dataset.</span>
                            </App.Content.Toolbar>

                            <div className='p-6'>
                                <ErrorNotice error={sourceRequest.error ?? definitionsRequest.error} />

                                {(sourceRequest.isPending || definitionsRequest.isPending) && (
                                    <Spinner className='size-6' role='status' aria-label='Loading' />
                                )}

                                {source && <SyncPanel source={source} />}
                            </div>
                        </>
                    )}
            </App.Content>
        </>
    )
}

interface TableContentProps {
    rid:           DataConnection.Source.Rid
    table:         DataConnection.Source.Table
    canCreateSync: boolean
    onCreateSync:  () => void
}

/** The picked table: its live first rows, with a way to sync it or close it (back to the syncs). */
function TableContent({ rid, table, canCreateSync, onCreateSync }: TableContentProps) {
    const navigate = useNavigate()

    const [, [previewRequest]] = DataConnectionSDK.useWith(
        () => null,
        query => [query.tablePreview(rid, table)],
    )

    const preview = previewRequest.data

    return (
        <>
            <App.Content.Toolbar>
                <span className='truncate font-mono text-sm font-medium'>{table.schema}.{table.name}</span>
                <span className='shrink-0 text-xs text-muted-foreground'>Live from source</span>

                <div className='ml-auto flex shrink-0 items-center gap-2'>
                    {preview && (
                        <span className='text-xs text-muted-foreground'>
                            Showing {preview.rows.length} rows · {preview.columns.length} columns
                        </span>
                    )}
                    <Button
                        variant='minimal'
                        size='sm'
                        icon='refresh'
                        aria-label='Refresh'
                        loading={previewRequest.isFetching}
                        onClick={() => void previewRequest.refetch()}
                    />
                    <Button size='sm' icon='add' disabled={!canCreateSync} onClick={onCreateSync}>
                        Create sync
                    </Button>
                    <Button
                        variant='minimal'
                        size='sm'
                        icon='cross'
                        aria-label='Close table'
                        onClick={() => void navigate({ to: '/data-connection/sources/$rid', params: { rid }, search: {} })}
                    />
                </div>
            </App.Content.Toolbar>

            <div className='min-h-0 flex-1'>
                <SourceTablePreview rid={rid} table={table} />
            </div>
        </>
    )
}

interface AboutPanelProps {
    source:     DataConnection.Source.Schema
    definition: DataConnection.Source.Definition.Schema | undefined
}

function AboutPanel({ source, definition }: AboutPanelProps) {
    return (
        <div className='flex flex-col gap-3 py-3'>
            <p className='text-xs text-muted-foreground'>{source.description || 'No description.'}</p>

            <Details className='grid-cols-[5.5rem_1fr] gap-y-2 text-xs'>
                <Detail label='Source type'>{definition?.displayName ?? source.definitionId}</Detail>
                <Detail label='Credential'>
                    {source.credentialRid ? <ResourceName rid={source.credentialRid} /> : 'None required'}
                </Detail>
                <Detail label='Location'>
                    <ResourcePath rid={source.rid} ancestorsOnly />
                </Detail>
                <Detail label='Output folder'>
                    {source.outputFolderRid ? <ResourcePath rid={source.outputFolderRid} /> : '—'}
                </Detail>
                <Detail label='Updated'>{dateTime(source.updatedAt)}</Detail>
                <Detail label='Created'>{dateTime(source.createdAt)}</Detail>
                <Detail label='RID'>
                    <span className='block truncate font-mono' title={source.rid}>{source.rid}</span>
                </Detail>
            </Details>
        </div>
    )
}

interface ResourcePathProps {
    rid:            Library.Resource.Rid
    /** Where it lives — its folders, not itself. */
    ancestorsOnly?: boolean
}

/** "/Project / Folder / …" — a resource's place in the library. */
function ResourcePath({ rid, ancestorsOnly = false }: ResourcePathProps) {
    const [path] = LibrarySDK.useWith(
        state => LibrarySDK.selectors.path(state, rid),
        query => [query.path(rid)],
    )

    const shown = ancestorsOnly ? path.slice(0, -1) : path
    const text = shown.map(ancestor => ancestor.name).join(' / ')

    return <span className='block truncate' title={text}>/{text}</span>
}

/** A resource's own name, with its icon (its path loads it). */
function ResourceName({ rid }: { rid: Library.Resource.Rid }) {
    const [resource] = LibrarySDK.useWith(
        state => state.resources[rid],
        query => [query.path(rid)],
    )

    if (!resource)
        return <span className='text-muted-foreground'>…</span>

    return (
        <span className='flex min-w-0 items-center gap-1.5'>
            <ResourceIcon type={resource.type} size='xs' />
            <span className='truncate' title={resource.name}>{resource.name}</span>
        </span>
    )
}

interface ExplorePanelProps {
    rid:      DataConnection.Source.Rid
    selected: DataConnection.Source.Table | null
}

/** The source's tables by schema, searchable; picking one opens it in the content. */
function ExplorePanel({ rid, selected }: ExplorePanelProps) {
    const navigate = useNavigate()

    const [tables, [tablesRequest]] = DataConnectionSDK.useWith(
        state => state.tables[rid] ?? [],
        query => [query.tables(rid)],
    )

    const [query, setQuery] = useState('')

    function open(table: DataConnection.Source.Table) {
        void navigate({ to: '/data-connection/sources/$rid', params: { rid }, search: { schema: table.schema, table: table.name } })
    }

    return (
        <div className='flex flex-col gap-2 py-3'>
            <div className='flex items-center gap-1.5'>
                <SearchInput wrapperClassName='flex-1' size='sm' placeholder='Search tables' onSearch={setQuery} />
                <Button
                    variant='minimal'
                    size='sm'
                    icon='refresh'
                    aria-label='Refresh tables'
                    loading={tablesRequest.isFetching}
                    onClick={() => void tablesRequest.refetch()}
                />
            </div>

            <ErrorNotice error={tablesRequest.error} />

            {tablesRequest.isPending && <Spinner className='size-4' role='status' aria-label='Loading tables' />}

            {tablesRequest.isSuccess && tables.length === 0 && (
                <Empty icon='database' title='No tables found' description='Check what the source login can access.' />
            )}

            {tables.length > 0 && (
                <SourceTableTree tables={tables} selected={selected} query={query} onSelect={open} />
            )}
        </div>
    )
}
