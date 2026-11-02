import { useState } from 'react'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Table } from '@quarry/standard-ui/foundations/table'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import type { DataConnection, Forge } from '@quarry/shared/domain'
import { ForgeSDK } from '@/SDKs/ForgeSDK/sdk'
import { BuildStatus } from '@/SDKs/ForgeSDK/ui/BuildStatus'
import { ErrorNotice } from '@/components/ErrorNotice'
import { dateTime } from '@/utils/format'

interface Props {
    sync: DataConnection.Sync
}

/** A sync's runs: the builds of its dataset, newest first. */
export function RunHistory({ sync }: Props) {
    const [builds, [buildsRequest]] = ForgeSDK.useWith(
        state => state.datasetBuilds[sync.outputDatasetRid] ?? [],
        query => [query.datasetBuilds(sync.outputDatasetRid)],
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
                    loading={buildsRequest.isFetching}
                    onClick={() => void buildsRequest.refetch()}
                />
            </div>

            <ErrorNotice error={buildsRequest.error} />

            {buildsRequest.isPending && <Spinner className='size-6' role='status' aria-label='Loading' />}

            {buildsRequest.isSuccess && builds.length === 0 && (
                <p className='text-slate-500 py-6'>No runs yet. Start this sync with Run now.</p>
            )}

            {builds.length > 0 && (
                <div className='table-panel'>
                    <Table.Root className='data-table'>
                        <Table.Header>
                            <Table.Row>
                                <Table.Head>Status</Table.Head>
                                <Table.Head>Started</Table.Head>
                                <Table.Head>Finished</Table.Head>
                                <Table.Head>Details</Table.Head>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {builds.map(build => (
                                <Table.Row key={build.rid}>
                                    <Table.Cell>
                                        <BuildStatus status={build.status} />
                                    </Table.Cell>
                                    <Table.Cell>{dateTime(build.createdAt)}</Table.Cell>
                                    <Table.Cell>{dateTime(build.finishedAt)}</Table.Cell>
                                    <Table.Cell>
                                        <RunDetails build={build} />
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

interface RunDetailsProps {
    build: Forge.Build
}

/** The build's RID, and why it failed once opened: a job's failure comes with the build, fetched then. */
function RunDetails({ build }: RunDetailsProps) {
    const [open, setOpen] = useState(false)

    return (
        <details onToggle={event => setOpen(event.currentTarget.open)}>
            <summary>View details</summary>
            <dl className='run-details'>
                <dt>Build</dt>
                <dd>{build.rid}</dd>
            </dl>
            {open && build.status === 'failed' && <RunFailure buildRid={build.rid} />}
        </details>
    )
}

interface RunFailureProps {
    buildRid: Forge.Build.Rid
}

function RunFailure({ buildRid }: RunFailureProps) {
    const [jobs, [buildRequest]] = ForgeSDK.useWith(
        state => state.buildJobs[buildRid] ?? {},
        query => [query.build(buildRid)],
    )

    return (
        <>
            <ErrorNotice error={buildRequest.error} />
            {Object.values(jobs).map(job => job.failure && (
                <pre key={job.rid} className='error-details'>{job.failure.message}</pre>
            ))}
        </>
    )
}
