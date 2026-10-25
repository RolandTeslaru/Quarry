import { Button } from '@quarry/standard-ui/foundations/button'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import type { DataConnection } from '@quarry/shared/domain'
import { DataConnectionSDK } from '../sdk'
import { ErrorNotice } from '@/components/ErrorNotice'
import { TableViewer } from '@quarry/standard-ui/components/TableViewer'

interface Props {
    rid:   DataConnection.Source.Rid
    table: DataConnection.Source.Table
}

/** A source table's first rows, read live from the source, in the shared table viewer. */
export function SourceTablePreview({ rid, table }: Props) {
    const [, [previewRequest]] = DataConnectionSDK.useWith(
        () => null,
        query => [query.tablePreview(rid, table)],
    )

    const preview = previewRequest.data

    if (previewRequest.isPending && !preview)
        return <Spinner className='m-4 size-6' role='status' aria-label='Loading preview' />

    if (previewRequest.error) {
        return (
            <div className='p-4'>
                <ErrorNotice error={previewRequest.error} />
                <Button onClick={() => void previewRequest.refetch()}>Try again</Button>
            </div>
        )
    }

    if (!preview || preview.rows.length === 0)
        return <p className='p-4 text-sm text-muted-foreground'>This table has no rows.</p>

    return <TableViewer columns={preview.columns} rows={preview.rows} />
}
