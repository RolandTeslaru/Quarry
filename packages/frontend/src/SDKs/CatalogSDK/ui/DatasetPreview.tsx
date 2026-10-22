import { HotkeysProvider } from '@blueprintjs/core'
import { Cell, Column, ColumnHeaderCell, Table2 } from '@blueprintjs/table'
import tableStyles from '@blueprintjs/table/lib/css/table.css?inline'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import type { Catalog } from '@quarry/shared/domain'
import { CatalogSDK } from '../sdk'
import { ErrorNotice } from '@/components/ErrorNotice'

const NUMERIC_TYPES = ['integer', 'long', 'double']

interface Props {
    rid: Catalog.Dataset.Rid
}

/** The latest view's first rows in a Blueprint table: row numbers, column name and type headers, resizable columns. */
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

    const columns = preview.schema.columns
    const rows = preview.rows

    return (
        <HotkeysProvider>
            <style>{tableStyles}</style>
            <Table2
                numRows={rows.length}
                defaultRowHeight={24}
                defaultColumnWidth={180}
                enableFocusedCell
                cellRendererDependencies={[rows]}
                className='h-full'
            >
                {columns.map((column, columnIndex) => (
                    <Column
                        key={column.name}
                        columnHeaderCellRenderer={() => renderTypedHeader(column)}
                        cellRenderer={rowIndex => (
                            <Cell className={isNumeric(column.type) ? 'text-right font-mono' : 'font-mono'}>
                                {cellText(rows[rowIndex]?.[columnIndex])}
                            </Cell>
                        )}
                    />
                ))}
            </Table2>
        </HotkeysProvider>
    )
}

/**
 * Column name over its type, as in Foundry's dataset preview. Returns the
 * ColumnHeaderCell element itself, not a wrapper component: the table clones it
 * with the props that size and place it (style, index), and a wrapper would drop them.
 */
function renderTypedHeader(column: Catalog.ColumnSchema.Column) {
    return (
        <ColumnHeaderCell
            nameRenderer={() => (
                <div className='flex flex-col py-1 leading-tight'>
                    <span className='truncate font-medium'>{column.name}</span>
                    <span className='text-xs text-muted-foreground'>{column.type}</span>
                </div>
            )}
        />
    )
}

const isNumeric = (type: string) => NUMERIC_TYPES.includes(type) || type.startsWith('decimal')

/** A JSON value as cell text; null shows as empty, like Foundry. */
function cellText(value: unknown): string {
    if (value === null || value === undefined)
        return ''

    if (typeof value === 'object')
        return JSON.stringify(value)

    return String(value)
}
