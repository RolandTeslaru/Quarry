import { Button } from '@quarry/standard-ui/foundations/button'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import type { Dataset } from '@quarry/shared/domain'
import { CatalogSDK } from '../sdk'
import { ErrorNotice } from '@/components/ErrorNotice'
import { TableViewer } from '@quarry/standard-ui/components/TableViewer'

interface Props {
    rid: Dataset.Rid
}

/** The latest view's first rows, in the shared table viewer. */
export function DatasetPreview({ rid }: Props) {
    const [, [previewRequest]] = CatalogSDK.useWith(
        () => null,
        query => [query.preview(rid)],
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

    if (!preview?.schema || preview.rows.length === 0)
        return <p className='p-4 text-sm text-muted-foreground'>No rows to preview yet.</p>

    return <TableViewer columns={preview.schema.columns} rows={preview.rows} />
}
