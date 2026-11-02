import { Table } from '@quarry/standard-ui/foundations/table'
import type { Dataset, Forge } from '@quarry/shared/domain'
import { BuildStatus } from '@/SDKs/ForgeSDK/ui/BuildStatus'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import { ResourceLink } from '@/components/ResourceLink'
import { dateTime } from '@/utils/format'

interface BuildTableProps {
    builds: Forge.Build[]
}

export function BuildTable({ builds }: BuildTableProps) {
    return (
        <Table.Root>
            <Table.Header>
                <Table.Row>
                    <Table.Head>Status</Table.Head>
                    <Table.Head>Builds</Table.Head>
                    <Table.Head>Branch</Table.Head>
                    <Table.Head>Started</Table.Head>
                    <Table.Head>Finished</Table.Head>
                </Table.Row>
            </Table.Header>
            <Table.Body>
                {builds.map(build => (
                    <Table.Row key={build.rid}>
                        <Table.Cell>
                            <BuildStatus status={build.status} />
                        </Table.Cell>
                        <Table.Cell>
                            <div className='flex flex-wrap gap-x-3 gap-y-1'>
                                {build.target.datasetRids.map(rid => <TargetDataset key={rid} rid={rid} />)}
                            </div>
                        </Table.Cell>
                        <Table.Cell>{build.branch}</Table.Cell>
                        <Table.Cell>{dateTime(build.createdAt)}</Table.Cell>
                        <Table.Cell>{dateTime(build.finishedAt)}</Table.Cell>
                    </Table.Row>
                ))}
            </Table.Body>
        </Table.Root>
    )
}

interface TargetDatasetProps {
    rid: Dataset.Rid
}

/** A target by name, linking to it — its library path is fetched once and cached. */
function TargetDataset({ rid }: TargetDatasetProps) {
    const [resource] = LibrarySDK.useWith(
        state => state.resources[rid],
        query => [query.path(rid)],
    )

    if (!resource)
        return <span className='text-slate-500'>…</span>

    return <ResourceLink resource={resource} />
}
