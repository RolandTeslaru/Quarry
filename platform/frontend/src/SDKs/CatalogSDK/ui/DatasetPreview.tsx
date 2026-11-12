import { Button } from '@quarry/standard-ui/foundations/button'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Icon } from '@quarry/standard-ui/icons'
import type { Dataset } from '@quarry/shared/domain'
import { CatalogSDK } from '../sdk'
import { ErrorNotice } from '@/components/ErrorNotice'
import { fileSize } from '@/utils/format'
import { TableViewer } from '@quarry/standard-ui/components/TableViewer'

interface Props {
    rid: Dataset.Rid
}

/** The latest view's first rows, in the shared table viewer — or, for raw files with no schema, the files themselves. */
export function DatasetPreview({ rid }: Props) {
    const [, [previewRequest, viewRequest]] = CatalogSDK.useWith(
        () => null,
        query => [query.preview(rid), query.view(rid)],
    )

    const preview = previewRequest.data
    const view = viewRequest.data?.view

    if ((previewRequest.isPending && !preview) || (viewRequest.isPending && !view))
        return <Spinner className='m-4 size-6' role='status' aria-label='Loading preview' />

    if (view && !view.schema && view.files.length > 0)
        return <RawFiles files={view.files} />

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

/** A raw dataset's files: no schema to read them as a table — a transform reads them (`files()`). */
function RawFiles({ files }: { files: Dataset.View['files'] }) {
    return (
        <div className='flex flex-col gap-3 p-4'>
            <p className='text-sm text-muted-foreground'>
                Raw files, with no schema: a transform reads them with <code className='font-mono text-xs'>files()</code>.
            </p>

            <ul className='flex flex-col rounded-md border border-border'>
                {files.map(file => (
                    <li key={file.logicalPath} className='flex items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0'>
                        <Icon name='document' size={14} className='shrink-0 text-muted-foreground' />
                        <span className='min-w-0 flex-1 truncate font-mono text-xs' title={file.logicalPath}>{file.logicalPath}</span>
                        <span className='shrink-0 text-xs text-muted-foreground uppercase'>{file.format}</span>
                        <span className='w-20 shrink-0 text-right text-xs text-muted-foreground'>{fileSize(file.bytes)}</span>
                    </li>
                ))}
            </ul>
        </div>
    )
}
