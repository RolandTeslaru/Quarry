import { useState } from 'react'
import { Button, FormGroup, HTMLTable, InputGroup, Spinner, Tag } from '@blueprintjs/core'
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

    const refresh = () => {
        void datasetRequest.refetch()
        void viewRequest.refetch()
    }

    if (datasetRequest.isPending)
        return <Spinner size={24} />

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
                    <Tag minimal>main</Tag>
                    <span className='text-sm text-slate-500'>Viewing {sequence ? `version ${sequence}` : 'latest'}</span>
                </div>

                <form className='flex items-end gap-2' onSubmit={event => {
                    event.preventDefault()
                    openVersion()
                }}>
                    <FormGroup label='Version' labelFor='dataset-version' className='w-28 mb-0!'>
                        <InputGroup
                            id='dataset-version'
                            type='number'
                            min={1}
                            max={dataset.lastSequence || 1}
                            placeholder='Latest'
                            aria-label='Dataset version'
                            value={sequenceInput}
                            onChange={event => setSequenceInput(event.target.value)}
                        />
                    </FormGroup>
                    <Button type='submit'>Open</Button>
                </form>
            </div>

            <ErrorNotice error={viewRequest.error} />

            {viewRequest.isPending && <Spinner size={24} />}

            {view && (
                <>
                    <h2 className='section-title mb-3'>Schema</h2>
                    <div className='table-panel mb-8'>
                        <HTMLTable striped className='data-table'>
                            <thead>
                                <tr>
                                    <th>Column</th>
                                    <th>Type</th>
                                    <th>Nullable</th>
                                </tr>
                            </thead>
                            <tbody>
                                {view.schema?.map(column => (
                                    <tr key={column.name}>
                                        <td className='font-mono'>{column.name}</td>
                                        <td>{column.type}</td>
                                        <td>{column.nullable ? 'Yes' : 'No'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </HTMLTable>
                        {!view.schema?.length && (
                            <p className='p-5 text-slate-500'>No schema yet. Run a sync to populate this dataset.</p>
                        )}
                    </div>

                    <h2 className='section-title mb-3'>Files</h2>
                    <div className='table-panel'>
                        <HTMLTable striped className='data-table'>
                            <thead>
                                <tr>
                                    <th>Path</th>
                                    <th>Format</th>
                                    <th>Bytes</th>
                                    <th>Rows</th>
                                </tr>
                            </thead>
                            <tbody>
                                {view.files.map(file => (
                                    <tr key={file.logicalPath}>
                                        <td className='font-mono break-all' title={file.key}>{file.logicalPath}</td>
                                        <td>{file.format}</td>
                                        <td>{number(file.bytes)}</td>
                                        <td>{number(file.rowCount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </HTMLTable>
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
