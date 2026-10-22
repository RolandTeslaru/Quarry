import { Button } from '@quarry/standard-ui/foundations/button'
import { Table } from '@quarry/standard-ui/foundations/table'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import type { Catalog } from '@quarry/shared/domain'
import { CatalogSDK } from '../sdk'
import { ErrorNotice } from '@/components/ErrorNotice'

interface Props {
    rid: Catalog.Dataset.Rid
}

/** The latest view's first rows, read with the dataset's schema. */
export function DatasetPreview({ rid }: Props) {
    const [, [previewRequest]] = CatalogSDK.useWith(
        () => null,
        query => [query.preview(rid)],
    )

    const preview = previewRequest.data

    if (previewRequest.isPending && !preview)
        return <Spinner className='size-6' role='status' aria-label='Loading preview' />

    if (previewRequest.error) {
        return (
            <>
                <ErrorNotice error={previewRequest.error} />
                <Button onClick={() => void previewRequest.refetch()}>Try again</Button>
            </>
        )
    }

    if (!preview?.schema || preview.rows.length === 0)
        return <p className='p-5 text-slate-500'>No rows to preview yet.</p>

    const columns = preview.schema.columns

    return (
        <div className='table-panel'>
            <Table.Root className='data-table'>
                <Table.Header>
                    <Table.Row>
                        {columns.map(column => (
                            <Table.Head key={column.name} className='font-mono'>
                                {column.name}
                            </Table.Head>
                        ))}
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {preview.rows.map((row, rowIndex) => (
                        <Table.Row key={rowIndex}>
                            {columns.map((column, columnIndex) => (
                                <Table.Cell key={column.name} className='font-mono whitespace-nowrap'>
                                    {cell(row[columnIndex])}
                                </Table.Cell>
                            ))}
                        </Table.Row>
                    ))}
                </Table.Body>
            </Table.Root>
        </div>
    )
}

/** A JSON value as table text; null shows as a dash. */
function cell(value: unknown): string {
    if (value === null || value === undefined)
        return '—'

    if (typeof value === 'object')
        return JSON.stringify(value)

    return String(value)
}
