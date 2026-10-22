import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Table } from '@quarry/standard-ui/foundations/table'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import type { DataConnection } from '@quarry/shared/domain'
import { DataConnectionSDK } from '../sdk'
import { NewSyncDialog } from './NewSyncDialog'
import { Empty } from '@/components/Empty'
import { ErrorNotice } from '@/components/ErrorNotice'

interface Props {
    source:     DataConnection.Source.Schema
    definition: DataConnection.Source.Definition.Schema
}

export function SourceTables({ source, definition }: Props) {
    const [tables, [tablesRequest]] = DataConnectionSDK.useWith(
        state => state.tables[source.rid] ?? [],
        query => [query.tables(source.rid)],
    )

    function openSyncDialog(table: DataConnection.Source.Table) {
        DialogSDK.actions.push(`new-sync-${source.rid}`, dialog => (
            <NewSyncDialog source={source} definition={definition} table={table} dialog={dialog} />
        ))
    }

    return (
        <section>
            <div className='section-toolbar'>
                <p className='text-slate-500'>Tables available from this source.</p>
                <Button
                    icon='refresh'
                    loading={tablesRequest.isFetching}
                    onClick={() => void tablesRequest.refetch()}
                >
                    Refresh tables
                </Button>
            </div>

            <ErrorNotice error={tablesRequest.error} />

            {tablesRequest.isPending && <Spinner className='size-6' role='status' aria-label='Loading' />}

            {tablesRequest.isSuccess && tables.length === 0 && (
                <Empty icon='database' title='No tables found' description='Check what the source login can access.' />
            )}

            {tables.length > 0 && (
                <div className='table-panel'>
                    <Table.Root className='data-table'>
                        <Table.Header>
                            <Table.Row>
                                <Table.Head>Schema</Table.Head>
                                <Table.Head>Table</Table.Head>
                                <Table.Head />
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {tables.map(table => (
                                <Table.Row key={`${table.schema}.${table.name}`}>
                                    <Table.Cell>{table.schema}</Table.Cell>
                                    <Table.Cell className='font-mono'>{table.name}</Table.Cell>
                                    <Table.Cell className='text-right'>
                                        <Button size='sm' icon='add' onClick={() => openSyncDialog(table)}>
                                            Create sync
                                        </Button>
                                    </Table.Cell>
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table.Root>
                </div>
            )}

        </section>
    )
}
