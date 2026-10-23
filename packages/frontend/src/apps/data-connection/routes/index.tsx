import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Table } from '@quarry/standard-ui/foundations/table'
import { App } from '@/AppKit'
import type { DataConnection } from '@quarry/shared/domain'
import { DataConnectionSDK } from '@/SDKs/DataConnectionSDK/sdk'
import { ErrorNotice } from '@/components/ErrorNotice'
import { ResourceLink } from '@/components/ResourceLink'
import { dateTime, number } from '@/utils/format'

export const Route = createFileRoute('/_workspace/data-connection/')({
    component: DataConnectionHome,
})

/** Data Connection's home: every source the user can see. */
function DataConnectionHome() {
    const [definitions, [sourcesRequest, definitionsRequest]] = DataConnectionSDK.useWith(
        state => state.definitions,
        query => [query.sources, query.definitions],
    )

    const sources = sourcesRequest.data?.sources ?? []

    function systemName(definitionId: DataConnection.Source.DefinitionId): string {
        return definitions[definitionId]?.displayName ?? definitionId
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
                <App.Home.Section title='Recently opened'>
                    <App.Home.Recents />
                </App.Home.Section>

                <App.Home.Section
                    title='Sources'
                    meta={<>{number(sources.length)} you can see</>}
                    actions={
                        <Button
                            variant='minimal'
                            icon='refresh'
                            aria-label='Refresh sources'
                            loading={sourcesRequest.isFetching}
                            onClick={() => void sourcesRequest.refetch()}
                        />
                    }
                >
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
                </App.Home.Section>
            </App.Home.Content>
        </App.Home.Root>
    )
}
