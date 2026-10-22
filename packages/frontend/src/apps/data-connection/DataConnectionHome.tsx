import { Button } from '@quarry/standard-ui/foundations/button'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Table } from '@quarry/standard-ui/foundations/table'
import { App } from '@/AppKit'
import { DataConnectionSDK } from '@/SDKs/DataConnectionSDK/sdk'
import { ErrorNotice } from '@/components/ErrorNotice'
import { ResourceLink } from '@/components/ResourceLink'
import { dateTime, number } from '@/utils/format'
import { dataConnectionApp } from './definition'

/** Data Connection's home: every source the user can see. */
export function DataConnectionHome() {
    const [definitions, [sourcesRequest, definitionsRequest]] = DataConnectionSDK.useWith(
        state => state.definitions,
        query => [query.sources, query.definitions],
    )

    const sources = sourcesRequest.data?.sources ?? []

    function systemName(definitionId: string): string {
        return definitions.find(definition => definition.id === definitionId)?.displayName ?? definitionId
    }

    return (
        <App.Root>
            <App.Header>
                <App.Header.Icon icon={dataConnectionApp.icon} />
                <App.Header.Rows>
                    <App.Header.Title>Data Connection</App.Header.Title>
                </App.Header.Rows>
                <App.Header.Actions>
                    <Button
                        variant='minimal'
                        icon='refresh'
                        aria-label='Refresh sources'
                        loading={sourcesRequest.isFetching}
                        onClick={() => void sourcesRequest.refetch()}
                    />
                </App.Header.Actions>
            </App.Header>

            <App.Content>
                <App.Content.Toolbar>
                    <span className='text-sm font-medium'>Sources</span>
                    <span className='text-xs text-muted-foreground'>{number(sources.length)} you can see</span>
                </App.Content.Toolbar>

                <div className='p-4'>
                    <ErrorNotice error={sourcesRequest.error ?? definitionsRequest.error} />

                    {sourcesRequest.isPending && <Spinner className='size-6' role='status' aria-label='Loading' />}

                    {sourcesRequest.isSuccess && sources.length === 0 && (
                        <p className='text-sm text-muted-foreground'>No sources yet. Connect one from a folder in the Library.</p>
                    )}

                    {sources.length > 0 && (
                        <Table.Root>
                            <Table.Header>
                                <Table.Row>
                                    <Table.Head>Name</Table.Head>
                                    <Table.Head>System</Table.Head>
                                    <Table.Head>Last updated</Table.Head>
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {sources.map(source => (
                                    <Table.Row key={source.rid}>
                                        <Table.Cell>
                                            <ResourceLink resource={source} />
                                        </Table.Cell>
                                        <Table.Cell>{systemName(source.definitionId)}</Table.Cell>
                                        <Table.Cell>{dateTime(source.updatedAt)}</Table.Cell>
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
