import { useState } from 'react'
import { Button, HTMLTable, Spinner } from '@blueprintjs/core'
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
    const [selectedTable, setSelectedTable] = useState<DataConnection.Source.Table | null>(null)

    const [tables, [tablesRequest]] = DataConnectionSDK.useWith(
        state => state.tables[source.rid] ?? [],
        query => [query.tables(source.rid)],
    )

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

            {tablesRequest.isPending && <Spinner size={24} />}

            {tablesRequest.isSuccess && tables.length === 0 && (
                <Empty icon='database' title='No tables found' description='Check what the source login can access.' />
            )}

            {tables.length > 0 && (
                <div className='table-panel'>
                    <HTMLTable striped className='data-table'>
                        <thead>
                            <tr>
                                <th>Schema</th>
                                <th>Table</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {tables.map(table => (
                                <tr key={`${table.schema}.${table.name}`}>
                                    <td>{table.schema}</td>
                                    <td className='font-mono'>{table.name}</td>
                                    <td className='text-right'>
                                        <Button size='small' icon='plus' onClick={() => setSelectedTable(table)}>
                                            Create sync
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </HTMLTable>
                </div>
            )}

            {selectedTable && (
                <NewSyncDialog
                    source={source}
                    definition={definition}
                    table={selectedTable}
                    onClose={() => setSelectedTable(null)}
                />
            )}
        </section>
    )
}
