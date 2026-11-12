import { Button } from '@quarry/standard-ui/foundations/button'
import { Menubar } from '@quarry/standard-ui/foundations/menubar'
import { Tabs } from '@quarry/standard-ui/foundations/tabs'
import { Icon } from '@quarry/standard-ui/icons'
import { Foundations, type Dataset } from '@quarry/shared/domain'
import { App } from '@/AppKit'
import { CatalogSDK } from '@/SDKs/CatalogSDK/sdk'
import { DatasetPreview } from '@/SDKs/CatalogSDK/ui/DatasetPreview'
import { ForgeSDK } from '@/SDKs/ForgeSDK/sdk'
import { ErrorNotice } from '@/components/ErrorNotice'
import { ResourceBreadcrumbs } from '@/components/ResourceBreadcrumbs'
import { number } from '@/utils/format'
import { datasetsApp } from '../definition'
import { DatasetAbout } from './DatasetAbout'
import { DatasetColumns } from './DatasetColumns'

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
        void CatalogSDK.invalidate(CatalogSDK.query.latestTransaction(rid))
        void ForgeSDK.invalidate(ForgeSDK.query.currentRecipe(rid))
        void ForgeSDK.invalidate(ForgeSDK.query.staleness([rid], Foundations.MAIN_BRANCH))
    }

    return (
        <App.Overlay>
            <App.Nav>
                <App.Nav.Start>
                    <App.Nav.Icon glyph={datasetsApp.glyph} />
                    <App.Nav.Rows>
                        <ResourceBreadcrumbs rid={rid} />
                        <App.Nav.Menubar>
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
                        </App.Nav.Menubar>
                    </App.Nav.Rows>
                </App.Nav.Start>

                <App.Nav.End>
                    <Button icon='refresh' loading={viewRequest.isFetching} onClick={refresh}>
                        Refresh
                    </Button>
                    <Button intent='primary' icon='upload' onClick={() => CatalogSDK.dialogs.openUploadToDataset({ datasetRid: rid })}>
                        Upload file
                    </Button>
                </App.Nav.End>
            </App.Nav>

            <App.LeftSidebar className='w-96'>
                <ViewTabs />

                <div className='flex items-start gap-2 px-3 py-2.5'>
                    <App.Glyph glyph={datasetsApp.glyph} size={16} bare className='mt-0.5' />
                    <h2 className='text-sm font-semibold break-all'>{dataset?.name ?? ''}</h2>
                </div>

                <Tabs.Root defaultValue='about' className='gap-0'>
                    <Tabs.List size='sm' className='mx-3 mb-1 w-auto' variant="accent" aria-label='Dataset details'>
                        <Tabs.Trigger value='about' className='flex-1'>About</Tabs.Trigger>
                        <Tabs.Trigger value='columns' className='flex-1'>Columns</Tabs.Trigger>
                    </Tabs.List>

                    <Tabs.Content value='about'>
                        {dataset && <DatasetAbout dataset={dataset} view={view} />}
                    </Tabs.Content>

                    <Tabs.Content value='columns'>
                        {view && <DatasetColumns rid={rid} view={view} />}
                    </Tabs.Content>
                </Tabs.Root>
            </App.LeftSidebar>

            <App.Content >
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
        </App.Overlay>
    )
}

/** The app's views, Foundry-style. Only Preview exists so far. */
function ViewTabs() {
    return (
        <div role='tablist' aria-label='Dataset views' className='flex border-b border-border px-3'>
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
