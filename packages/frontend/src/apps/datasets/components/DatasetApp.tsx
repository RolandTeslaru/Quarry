import { Button } from '@quarry/standard-ui/foundations/button'
import { Menubar } from '@quarry/standard-ui/foundations/menubar'
import { Tabs } from '@quarry/standard-ui/foundations/tabs'
import { Icon } from '@quarry/standard-ui/icons'
import type { Dataset } from '@quarry/shared/domain'
import { App } from '@/AppKit'
import { CatalogSDK } from '@/SDKs/CatalogSDK/sdk'
import { DatasetPreview } from '@/SDKs/CatalogSDK/ui/DatasetPreview'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import { Detail, Details } from '@/components/Details'
import { ErrorNotice } from '@/components/ErrorNotice'
import { ResourceBreadcrumbs } from '@/components/ResourceBreadcrumbs'
import { dateTime, fileSize, number } from '@/utils/format'
import { datasetsApp } from '../definition'

interface Props {
    rid: Dataset.Rid
}

/** The dataset app: the latest rows in the content, the dataset's details in the left sidebar. */
export function DatasetApp({ rid }: Props) {
    const [dataset, [datasetRequest]] = CatalogSDK.useWith(
        state => state.datasets[rid],
        query => [query.dataset(rid)],
    )

    const [, [viewRequest, previewRequest]] = CatalogSDK.useWith(
        () => null,
        query => [query.view(rid), query.preview(rid)],
    )

    const view = viewRequest.data?.view
    const preview = previewRequest.data

    function refresh() {
        void datasetRequest.refetch()
        void viewRequest.refetch()
        void previewRequest.refetch()
    }

    return (
        <>
            <App.Navbar>
                <App.Navbar.Icon glyph={datasetsApp.glyph} />
                <App.Navbar.Rows>
                    <ResourceBreadcrumbs rid={rid} />
                    <App.Navbar.Menubar>
                        <Menubar.Menu>
                            <Menubar.Trigger>File</Menubar.Trigger>
                            <Menubar.Content>
                                <Menubar.Item onSelect={() => CatalogSDK.dialogs.openUploadToDataset({ datasetRid: rid })}>
                                    <Icon name='upload' />
                                    Upload file…
                                </Menubar.Item>
                                <Menubar.Item onSelect={refresh}>
                                    <Icon name='refresh' />
                                    Refresh
                                </Menubar.Item>
                            </Menubar.Content>
                        </Menubar.Menu>
                    </App.Navbar.Menubar>
                </App.Navbar.Rows>

                <App.Navbar.Actions>
                    <Button icon='refresh' loading={viewRequest.isFetching} onClick={refresh}>
                        Refresh
                    </Button>
                    <Button intent='primary' icon='upload' onClick={() => CatalogSDK.dialogs.openUploadToDataset({ datasetRid: rid })}>
                        Upload file
                    </Button>
                </App.Navbar.Actions>
            </App.Navbar>

            <App.LeftSidebar className='w-96'>
                <ViewTabs />

                <div className='flex items-start gap-2 px-4 py-3'>
                    <App.Glyph glyph={datasetsApp.glyph} size={16} bare className='mt-0.5' />
                    <h2 className='text-sm font-semibold break-all'>{dataset?.name ?? ''}</h2>
                </div>

                <Tabs.Root defaultValue='about' className='px-4'>
                    <Tabs.List className='w-full' aria-label='Dataset details'>
                        <Tabs.Trigger value='about' className='flex-1'>About</Tabs.Trigger>
                        <Tabs.Trigger value='columns' className='flex-1'>Columns</Tabs.Trigger>
                    </Tabs.List>

                    <Tabs.Content value='about'>
                        {dataset && <AboutPanel dataset={dataset} view={view} />}
                    </Tabs.Content>

                    <Tabs.Content value='columns'>
                        {view && <ColumnsPanel view={view} />}
                    </Tabs.Content>
                </Tabs.Root>
            </App.LeftSidebar>

            <App.Content>
                <App.Content.Toolbar>
                    <span className='text-sm font-medium'>{dataset?.name ?? 'Preview'}</span>
                    <span className='text-xs text-muted-foreground'>
                        {dataset ? `Latest · version ${number(dataset.lastSequence)}` : ''}
                    </span>

                    {preview?.schema && (
                        <span className='ml-auto text-xs text-muted-foreground'>
                            Showing {number(preview.rows.length)} rows · {number(preview.schema.columns.length)} columns
                        </span>
                    )}
                </App.Content.Toolbar>

                <ErrorNotice error={datasetRequest.error ?? viewRequest.error} />

                <div className='min-h-0 flex-1'>
                    <DatasetPreview rid={rid} />
                </div>
            </App.Content>
        </>
    )
}

/** The app's views, Foundry-style. Only Preview exists so far. */
function ViewTabs() {
    return (
        <div role='tablist' aria-label='Dataset views' className='flex border-b border-border px-4'>
            <span
                role='tab'
                aria-selected
                className='-mb-px border-b-2 border-primary py-2.5 text-sm font-medium text-foreground'
            >
                Preview
            </span>
        </div>
    )
}

interface AboutPanelProps {
    dataset: Dataset.Schema
    view:    Dataset.View.Schema | undefined
}

function AboutPanel({ dataset, view }: AboutPanelProps) {
    const [path] = LibrarySDK.useWith(
        state => LibrarySDK.selectors.path(state, dataset.rid),
        query => [query.path(dataset.rid)],
    )

    const location = path.slice(0, -1).map(ancestor => ancestor.name).join(' / ')

    return (
        <div className='flex flex-col gap-4 py-4'>
            <p className='text-sm text-muted-foreground'>{dataset.description || 'No description.'}</p>

            <Details>
                <Detail label='Updated'>{dateTime(dataset.updatedAt)}</Detail>
                <Detail label='Created'>{dateTime(dataset.createdAt)}</Detail>
                <Detail label='Location'>
                    <span className='block truncate' title={location}>/{location}</span>
                </Detail>
                <Detail label='Type'>Dataset</Detail>
                <Detail label='Size'>{view ? sizeSummary(view) : '—'}</Detail>
                <Detail label='Format'>{view?.schema?.reader.format ?? '—'}</Detail>
                <Detail label='RID'>
                    <span className='block truncate font-mono text-xs' title={dataset.rid}>{dataset.rid}</span>
                </Detail>
            </Details>
        </div>
    )
}

interface ColumnsPanelProps {
    view: Dataset.View.Schema
}

function ColumnsPanel({ view }: ColumnsPanelProps) {
    if (!view.schema)
        return <p className='py-4 text-sm text-muted-foreground'>No schema yet. Upload a file to start.</p>

    return (
        <ul className='flex flex-col py-2'>
            {view.schema.columns.map(column => (
                <li key={column.name} className='flex items-center justify-between gap-3 border-b border-border py-2 text-sm'>
                    <span className='truncate font-mono'>{column.name}</span>
                    <span className='shrink-0 text-xs text-muted-foreground'>{column.type}</span>
                </li>
            ))}
        </ul>
    )
}

/** "5 columns • 1 file • 229 KB" */
function sizeSummary(view: Dataset.View.Schema): string {
    const columns = view.schema?.columns.length ?? 0
    const files = view.files.length
    const bytes = view.files.reduce((total, file) => total + file.bytes, 0)

    return `${columns} columns • ${files} ${files === 1 ? 'file' : 'files'} • ${fileSize(bytes)}`
}
