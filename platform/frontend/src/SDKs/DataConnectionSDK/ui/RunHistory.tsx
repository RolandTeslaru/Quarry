import { Button } from '@quarry/standard-ui/foundations/button'
import { Table } from '@quarry/standard-ui/foundations/table'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Icon } from '@quarry/standard-ui/icons'
import { Badge } from '@quarry/standard-ui/foundations/Badge'
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

            {runsRequest.isPending && <Spinner className='size-6' role='status' aria-label='Loading' />}

            {runsRequest.isSuccess && runs.length === 0 && (
                <p className='text-slate-500 py-6'>No runs yet. Start this sync with Run now.</p>
            )}

            {runs.length > 0 && (
                <div className='table-panel'>
                    <Table.Root className='data-table'>
                        <Table.Header>
                            <Table.Row>
                                <Table.Head>Status</Table.Head>
                                <Table.Head>Started</Table.Head>
                                <Table.Head>Trigger</Table.Head>
                                <Table.Head>Rows</Table.Head>
                                <Table.Head>Finished</Table.Head>
                                <Table.Head>Details</Table.Head>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {runs.map(run => (
                                <Table.Row key={run.rid}>
                                    <Table.Cell>
                                        <RunStatus status={run.status} />
                                    </Table.Cell>
                                    <Table.Cell>{dateTime(run.startedAt)}</Table.Cell>
                                    <Table.Cell>{run.trigger}</Table.Cell>
                                    <Table.Cell>{number(run.rowCount)}</Table.Cell>
                                    <Table.Cell>{dateTime(run.finishedAt)}</Table.Cell>
                                    <Table.Cell>
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

interface RunStatusProps {
    status: DataConnection.SyncRun.Status
}

function RunStatus({ status }: RunStatusProps) {
    if (status === 'succeeded') {
        return (
            <Badge variant='success'>
                <Icon name='tick' />
                Succeeded
            </Badge>
        )
    }

    if (status === 'failed') {
        return (
            <Badge variant='destructive'>
                <Icon name='error' />
                Failed
            </Badge>
        )
    }

    return (
        <Badge variant='active'>
            <Icon name='time' />
            Running
        </Badge>
    )
}
