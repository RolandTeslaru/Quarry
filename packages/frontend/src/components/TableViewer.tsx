import { HotkeysProvider } from '@blueprintjs/core'
import { Cell, Column, ColumnHeaderCell, Table2 } from '@blueprintjs/table'
import tableStyles from '@blueprintjs/table/lib/css/table.css?inline'
import type { Catalog } from '@quarry/shared/domain'

const NUMERIC_TYPES = ['integer', 'long', 'double']

interface Props {
    columns: readonly Pick<Catalog.ColumnSchema.Column, 'name' | 'type'>[]
    /** One value per column, in column order. */
    rows:    readonly (readonly unknown[])[]
}

/**
 * Rows in a Blueprint table: row numbers, column name and type headers,
 * resizable columns — the one table for any rows, whether a dataset's preview
 * or a source table's. Fills its parent's height.
 */
export function TableViewer({ columns, rows }: Props) {
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
function renderTypedHeader(column: Props['columns'][number]) {
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
