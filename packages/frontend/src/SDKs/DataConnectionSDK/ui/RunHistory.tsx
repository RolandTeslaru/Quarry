import { Button, HTMLTable, Spinner, Tag } from '@blueprintjs/core'
import type { DataConnection } from '@quarry/shared/domain'
import { DataConnectionSDK } from '../sdk'
import { ErrorNotice } from '@/components/ErrorNotice'
import { dateTime, number } from '@/utils/format'

interface Props {
    sourceRid: DataConnection.Source.Rid
    sync:      DataConnection.Sync.Schema
}

export function RunHistory({ sourceRid, sync }: Props) {
    const [runs, [runsRequest]] = DataConnectionSDK.useWith(
        state => state.runs[sync.rid] ?? [],
        query => [query.runs(sourceRid, sync.rid)],
    )

    return (
        <section className='mt-8'>
            <div className='section-toolbar'>
                <div>
                    <h2 className='section-title'>Run history</h2>
                    <p className='text-sm text-slate-500'>{sync.name} · refreshes automatically</p>
                </div>
                <Button
                    icon='refresh'
                    variant='minimal'
                    aria-label='Refresh runs'
                    loading={runsRequest.isFetching}
                    onClick={() => void runsRequest.refetch()}
                />
            </div>

            <ErrorNotice error={runsRequest.error} />

            {runsRequest.isPending && <Spinner size={24} />}

            {runsRequest.isSuccess && runs.length === 0 && (
                <p className='text-slate-500 py-6'>No runs yet. Start this sync with Run now.</p>
            )}

            {runs.length > 0 && (
                <div className='table-panel'>
                    <HTMLTable striped className='data-table'>
                        <thead>
                            <tr>
                                <th>Status</th>
                                <th>Started</th>
                                <th>Trigger</th>
                                <th>Rows</th>
                                <th>Finished</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {runs.map(run => (
                                <tr key={run.rid}>
                                    <td>
                                        <RunStatus status={run.status} />
                                    </td>
                                    <td>{dateTime(run.startedAt)}</td>
                                    <td>{run.trigger}</td>
                                    <td>{number(run.rowCount)}</td>
                                    <td>{dateTime(run.finishedAt)}</td>
                                    <td>
                                        <details>
                                            <summary>View details</summary>
                                            <dl className='run-details'>
                                                <dt>Run</dt>
                                                <dd>{run.rid}</dd>
                                                <dt>Previous state</dt>
                                                <dd>{run.stateFrom ?? '—'}</dd>
                                                <dt>Next state</dt>
                                                <dd>{run.stateTo ?? '—'}</dd>
                                            </dl>
                                            {run.error != null && (
                                                <pre className='error-details'>{JSON.stringify(run.error, null, 2)}</pre>
                                            )}
                                        </details>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </HTMLTable>
                </div>
            )}
        </section>
    )
}

function RunStatus({ status }: { status: DataConnection.SyncRun.Status }) {
    if (status === 'succeeded')
        return <Tag minimal intent='success' icon='tick'>Succeeded</Tag>

    if (status === 'failed')
        return <Tag minimal intent='danger' icon='error'>Failed</Tag>

    return <Tag minimal intent='primary' icon='time'>Running</Tag>
}
