import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Callout } from '@quarry/standard-ui/foundations/callout'
import { Table } from '@quarry/standard-ui/foundations/table'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import type { DataConnection } from '@quarry/shared/domain'
import { DataConnectionSDK } from '../sdk'
import { RunHistory } from './RunHistory'
import { Empty } from '@/components/Empty'
import { ErrorNotice } from '@/components/ErrorNotice'
import { useTask } from '@/hooks/useTask'

interface Props {
    source: DataConnection.Source.Schema
}

export function SyncPanel({ source }: Props) {
    const [selectedRid, setSelectedRid] = useState<DataConnection.Sync.Rid | null>(null)
    const [queuedRid, setQueuedRid] = useState<DataConnection.Sync.Rid | null>(null)

    const [syncsByRid, [syncsRequest]] = DataConnectionSDK.useWith(
        state => state.syncs[source.rid] ?? {},
        query => [query.syncs(source.rid)],
    )

    const syncs = Object.values(syncsByRid)

    const [task, withTask] = useTask()
    const selected = (selectedRid && syncsByRid[selectedRid]) || syncs[0]

    const runSync = withTask(async (sync: DataConnection.Sync.Schema) => {
        setQueuedRid(null)
        setSelectedRid(sync.rid)

        await DataConnectionSDK.actions.sync.run(source.rid, sync.rid)

        setQueuedRid(sync.rid)
    })

    return (
        <section>
            <ErrorNotice error={syncsRequest.error} />

            {syncsRequest.isPending && <Spinner className='size-6' role='status' aria-label='Loading' />}

            {syncsRequest.isSuccess && syncs.length === 0 && (
                <Empty
                    icon='exchange'
                    title='Choose what to bring in'
                    description='Create a sync for a table or SQL query. Each run produces a new dataset version.'
                />
            )}

            {syncs.length > 0 && (
                <div className='table-panel'>
                    <Table.Root className='data-table'>
                        <Table.Header>
                            <Table.Row>
                                <Table.Head>Sync</Table.Head>
                                <Table.Head>Schedule</Table.Head>
                                <Table.Head>Output</Table.Head>
                                <Table.Head />
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {syncs.map(sync => (
                                <Table.Row key={sync.rid}>
                                    <Table.Cell>
                                        <Button variant='minimal' onClick={() => setSelectedRid(sync.rid)}>
                                            {sync.name}
                                        </Button>
                                    </Table.Cell>
                                    <Table.Cell className='font-mono'>{sync.schedule ?? 'Manual'}</Table.Cell>
                                    <Table.Cell>
                                        <Link to='/library/$rid' params={{ rid: sync.outputDatasetRid }}>
                                            Open dataset
                                        </Link>
                                    </Table.Cell>
                                    <Table.Cell className='text-right'>
                                        <Button
                                            size='sm'
                                            icon='play'
                                            disabled={!sync.enabled || task.pending}
                                            onClick={() => runSync(sync)}
                                        >
                                            Run now
                                        </Button>
                                    </Table.Cell>
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table.Root>
                </div>
            )}

            {queuedRid && (
                <Callout intent='success' className='mt-4'>
                    Run queued. It will appear in history when a worker starts it.
                </Callout>
            )}

            {selected && <RunHistory key={selected.rid} sourceRid={source.rid} sync={selected} />}
        </section>
    )
}
