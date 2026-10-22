import { Button } from '@quarry/standard-ui/foundations/button'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Table } from '@quarry/standard-ui/foundations/table'
import { App } from '@/AppKit'
import { CatalogSDK } from '@/SDKs/CatalogSDK/sdk'
import { ErrorNotice } from '@/components/ErrorNotice'
import { ResourceLink } from '@/components/ResourceLink'
import { dateTime, number } from '@/utils/format'
import { datasetsApp } from './definition'

/** The dataset app's home: every dataset the user can see. */
export function DatasetsHome() {
    const [, [datasetsRequest]] = CatalogSDK.useWith(
        () => null,
        query => [query.datasets],
    )

    const datasets = datasetsRequest.data?.datasets ?? []

    return (
        <App.Root>
            <App.Header>
                <App.Header.Icon glyph={datasetsApp.glyph} />
                <App.Header.Rows>
                    <App.Header.Title>Datasets</App.Header.Title>
                </App.Header.Rows>
                <App.Header.Actions>
                    <Button
                        variant='minimal'
                        icon='refresh'
                        aria-label='Refresh datasets'
                        loading={datasetsRequest.isFetching}
                        onClick={() => void datasetsRequest.refetch()}
                    />
                </App.Header.Actions>
            </App.Header>

            <App.Content>
                <App.Content.Toolbar>
                    <span className='text-sm font-medium'>All datasets</span>
                    <span className='text-xs text-muted-foreground'>{number(datasets.length)} you can see</span>
                </App.Content.Toolbar>

                <div className='p-4'>
                    <ErrorNotice error={datasetsRequest.error} />

                    {datasetsRequest.isPending && <Spinner className='size-6' role='status' aria-label='Loading' />}

                    {datasetsRequest.isSuccess && datasets.length === 0 && (
                        <p className='text-sm text-muted-foreground'>No datasets yet. Upload a file into a folder in the Library.</p>
                    )}

                    {datasets.length > 0 && (
                        <Table.Root>
                            <Table.Header>
                                <Table.Row>
                                    <Table.Head>Name</Table.Head>
                                    <Table.Head>Latest version</Table.Head>
                                    <Table.Head>Last updated</Table.Head>
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {datasets.map(dataset => (
                                    <Table.Row key={dataset.rid}>
                                        <Table.Cell>
                                            <ResourceLink resource={dataset} />
                                        </Table.Cell>
                                        <Table.Cell>{number(dataset.lastSequence)}</Table.Cell>
                                        <Table.Cell>{dateTime(dataset.updatedAt)}</Table.Cell>
                                    </Table.Row>
                                ))}
                            </Table.Body>
                        </Table.Root>
                    )}
                </div>
            </App.Content>
        </App.Root>
    )
}
