import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Table } from '@quarry/standard-ui/foundations/table'
import { Home } from '@/AppKit'
import { CatalogSDK } from '@/SDKs/CatalogSDK/sdk'
import { ErrorNotice } from '@/components/ErrorNotice'
import { ResourceLink } from '@/components/ResourceLink'
import { dateTime, number } from '@/utils/format'

export const Route = createFileRoute('/_shell/datasets/')({
    component: DatasetsHome,
})

/** The dataset app's home: every dataset the user can see. */
function DatasetsHome() {
    const [, [datasetsRequest]] = CatalogSDK.useWith(
        () => null,
        query => [query.datasets],
    )

    const datasets = datasetsRequest.data?.datasets ?? []

    return (
        <Home.Root>
            <Home.Header>
                <Home.Logo />
                <Home.PreTitle />
                <Home.Title />
                <Home.TitleDescription />
            </Home.Header>

            <Home.Content>
                <Home.Section title='Recently opened'>
                    <Home.Recents />
                </Home.Section>

                <Home.Section
                    title='All datasets'
                    meta={<>{number(datasets.length)} you can see</>}
                    actions={
                        <Button
                            variant='minimal'
                            icon='refresh'
                            aria-label='Refresh datasets'
                            loading={datasetsRequest.isFetching}
                            onClick={() => void datasetsRequest.refetch()}
                        />
                    }
                >
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
                </Home.Section>
            </Home.Content>
        </Home.Root>
    )
}
