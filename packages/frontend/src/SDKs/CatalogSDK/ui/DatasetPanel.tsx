import { useState, type FormEvent } from 'react'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Field } from '@quarry/standard-ui/foundations/fieldLayout'
import { Table } from '@quarry/standard-ui/foundations/table'
import { Input } from '@quarry/standard-ui/foundations/input'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Badge } from '@quarry/standard-ui/foundations/Badge'
import type { Catalog } from '@quarry/shared/domain'
import { CatalogSDK } from '../sdk'
import { ErrorNotice } from '@/components/ErrorNotice'
import { PageHeader } from '@/components/PageHeader'
import { number } from '@/utils/format'

interface Props {
    rid: Catalog.Dataset.Rid
}

export function DatasetPanel({ rid }: Props) {
    const [sequence, setSequence] = useState<number | undefined>()
    const [sequenceInput, setSequenceInput] = useState('')

    const [dataset, [datasetRequest]] = CatalogSDK.useWith(
        state => state.datasets[rid],
        query => [query.dataset(rid)],
    )

    const [view, [viewRequest]] = CatalogSDK.useWith(
        state => CatalogSDK.selectors.view(state, rid, sequence),
        query => [query.view(rid, sequence)],
    )

    const openVersion = () => {
        if (!sequenceInput) {
            setSequence(undefined)

            return
        }

        const nextSequence = Number(sequenceInput)

        if (Number.isInteger(nextSequence) && nextSequence > 0 && nextSequence <= dataset.lastSequence)
            setSequence(nextSequence)
    }

    function submitVersion(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        openVersion()
    }

    const refresh = () => {
        void datasetRequest.refetch()
        void viewRequest.refetch()
    }

    if (datasetRequest.isPending)
        return <Spinner className='size-6' role='status' aria-label='Loading' />

    if (datasetRequest.error)
        return <ErrorNotice error={datasetRequest.error} />

    if (!dataset)
        return <ErrorNotice error='Dataset not found.' />

    return (
        <>
            <PageHeader
                eyebrow='CATALOG · DATASET'
                title={dataset.name}
                description={dataset.description ?? 'An immutable file collection with a versioned history.'}
                actions={(
                    <Button icon='refresh' loading={viewRequest.isFetching} onClick={refresh}>
                        Refresh
                    </Button>
                )}
            />

            <div className='dataset-metrics'>
                <Metric label='LATEST VERSION' value={number(dataset.lastSequence)} />
                <Metric label='ROWS IN VIEW' value={number(view?.rowCount)} />
                <Metric label='FILES' value={number(view?.files.length)} />
                <Metric label='COLUMNS' value={number(view?.schema?.length)} />
            </div>

            <div className='section-toolbar'>
                <div className='flex items-center gap-2'>
                    <Badge variant='secondary'>main</Badge>
                    <span className='text-sm text-slate-500'>Viewing {sequence ? `version ${sequence}` : 'latest'}</span>
                </div>

                <form className='flex items-end gap-2' onSubmit={submitVersion}>
                    <Field.Root className='w-28 mb-0!'>
                        <Field.Label htmlFor='dataset-version'>Version</Field.Label>
                        <Input
                            id='dataset-version'
                            type='number'
                            min={1}
                            max={dataset.lastSequence || 1}
                            placeholder='Latest'
                            aria-label='Dataset version'
                            value={sequenceInput}
                            onChange={event => setSequenceInput(event.target.value)}
                        />
                    </Field.Root>
                    <Button type='submit'>Open</Button>
                </form>
            </div>

            <ErrorNotice error={viewRequest.error} />

            {viewRequest.isPending && <Spinner className='size-6' role='status' aria-label='Loading' />}

            {view && (
                <>
                    <h2 className='section-title mb-3'>Schema</h2>
                    <div className='table-panel mb-8'>
                        <Table.Root className='data-table'>
                            <Table.Header>
                                <Table.Row>
                                    <Table.Head>Column</Table.Head>
                                    <Table.Head>Type</Table.Head>
                                    <Table.Head>Nullable</Table.Head>
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {view.schema?.map(column => (
                                    <Table.Row key={column.name}>
                                        <Table.Cell className='font-mono'>{column.name}</Table.Cell>
                                        <Table.Cell>{column.type}</Table.Cell>
                                        <Table.Cell>{column.nullable ? 'Yes' : 'No'}</Table.Cell>
                                    </Table.Row>
                                ))}
                            </Table.Body>
                        </Table.Root>
                        {!view.schema?.length && (
                            <p className='p-5 text-slate-500'>No schema yet. Run a sync to populate this dataset.</p>
                        )}
                    </div>

                    <h2 className='section-title mb-3'>Files</h2>
                    <div className='table-panel'>
                        <Table.Root className='data-table'>
                            <Table.Header>
                                <Table.Row>
                                    <Table.Head>Path</Table.Head>
                                    <Table.Head>Format</Table.Head>
                                    <Table.Head>Bytes</Table.Head>
                                    <Table.Head>Rows</Table.Head>
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {view.files.map(file => (
                                    <Table.Row key={file.logicalPath}>
                                        <Table.Cell className='font-mono break-all' title={file.key}>
                                            {file.logicalPath}
                                        </Table.Cell>
                                        <Table.Cell>{file.format}</Table.Cell>
                                        <Table.Cell>{number(file.bytes)}</Table.Cell>
                                        <Table.Cell>{number(file.rowCount)}</Table.Cell>
                                    </Table.Row>
                                ))}
                            </Table.Body>
                        </Table.Root>
                        {view.files.length === 0 && <p className='p-5 text-slate-500'>This view has no files.</p>}
                    </div>
                </>
            )}
        </>
    )
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className='eyebrow'>{label}</div>
            <div className='metric-value'>{value}</div>
        </div>
    )
}
