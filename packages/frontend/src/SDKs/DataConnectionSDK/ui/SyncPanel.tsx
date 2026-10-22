import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button, Callout, HTMLTable, Spinner } from '@blueprintjs/core'
import type { DataConnection } from '@quarry/shared/domain'
import { DataConnectionSDK } from '../sdk'
import { NewSyncDialog } from './NewSyncDialog'
import { RunHistory } from './RunHistory'
import { Empty } from '@/components/Empty'
import { ErrorNotice } from '@/components/ErrorNotice'
import { useTask } from '@/hooks/useTask'

interface Props {
    source:     DataConnection.Source.Schema
    definition: DataConnection.Source.Definition.Schema
}

export function SyncPanel({ source, definition }: Props) {
    const [isCreating, setIsCreating] = useState(false)
    const [selectedRid, setSelectedRid] = useState<DataConnection.Sync.Rid | null>(null)
    const [queuedRid, setQueuedRid] = useState<DataConnection.Sync.Rid | null>(null)

    const [syncs, [syncsRequest]] = DataConnectionSDK.useWith(
        state => state.syncs[source.rid] ?? [],
        query => [query.syncs(source.rid)],
    )

    const task = useTask()
    const selected = syncs.find(sync => sync.rid === selectedRid) ?? syncs[0]

    const runSync = (sync: DataConnection.Sync.Schema) => task.run(async () => {
        setQueuedRid(null)
        setSelectedRid(sync.rid)

        await DataConnectionSDK.actions.sync.run(source.rid, sync.rid)

        setQueuedRid(sync.rid)
    })

    return (
        <section>
            <div className='section-toolbar'>
                <p className='text-slate-500'>Copy a table or query into a versioned dataset.</p>
                <Button icon='plus' intent='primary' onClick={() => setIsCreating(true)}>
                    Create sync
                </Button>
            </div>

            <ErrorNotice error={syncsRequest.error ?? task.error} />

            {syncsRequest.isPending && <Spinner size={24} />}

            {syncsRequest.isSuccess && syncs.length === 0 && (
                <Empty
                    icon='exchange'
                    title='Choose what to bring in'
                    description='Create a sync for a table or SQL query. Each run produces a new dataset version.'
                />
            )}

            {syncs.length > 0 && (
                <div className='table-panel'>
                    <HTMLTable striped className='data-table'>
                        <thead>
                            <tr>
                                <th>Sync</th>
                                <th>Schedule</th>
                                <th>Output</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {syncs.map(sync => (
                                <tr key={sync.rid}>
                                    <td>
                                        <Button variant='minimal' onClick={() => setSelectedRid(sync.rid)}>
                                            {sync.name}
                                        </Button>
                                    </td>
                                    <td className='font-mono'>{sync.schedule ?? 'Manual'}</td>
                                    <td>
                                        <Link to='/resources/$rid' params={{ rid: sync.outputDatasetRid }}>
                                            Open dataset
                                        </Link>
                                    </td>
                                    <td className='text-right'>
                                        <Button
                                            size='small'
                                            icon='play'
                                            disabled={!sync.enabled || task.pending}
                                            onClick={() => void runSync(sync)}
                                        >
                                            Run now
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </HTMLTable>
                </div>
            )}

            {queuedRid && (
                <Callout intent='success' className='mt-4'>
                    Run queued. It will appear in history when a worker starts it.
                </Callout>
            )}

            {selected && <RunHistory key={selected.rid} sourceRid={source.rid} sync={selected} />}

            {isCreating && (
                <NewSyncDialog source={source} definition={definition} onClose={() => setIsCreating(false)} />
            )}
        </section>
    )
}
