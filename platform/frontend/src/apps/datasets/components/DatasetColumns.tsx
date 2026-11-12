import { useState } from 'react'
import { Button } from '@quarry/standard-ui/foundations/button'
import { SearchInput } from '@quarry/standard-ui/foundations/searchInput'
import { Icon, type IconName } from '@quarry/standard-ui/icons'
import type { Catalog, Dataset } from '@quarry/shared/domain'
import { CatalogSDK } from '@/SDKs/CatalogSDK/sdk'
import { Detail, Details } from '@/components/Details'
import { number } from '@/utils/format'

interface Props {
    rid:  Dataset.Rid
    view: Dataset.View
}

/**
 * The Columns tab: every column with its type, filterable; its NULL share once the dataset's
 * statistics are computed — a read of every file, so on demand — and the rest when expanded.
 */
export function DatasetColumns({ rid, view }: Props) {
    const [filter, setFilter] = useState('')
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    const [, [statsRequest]] = CatalogSDK.useWith(
        () => null,
        query => [{ ...query.columnStats(rid), enabled: false }],
    )

    if (!view.schema)
        return <p className='px-3 py-4 text-sm text-muted-foreground'>No schema yet. Upload a file to start.</p>

    const stats = statsRequest.data
    const outdated = stats !== undefined && stats.sequence !== view.sequence
    const needle = filter.trim().toLowerCase()
    const columns: Catalog.ColumnSchema.Column[] = []

    for (const column of view.schema.columns)
        if (!needle || column.name.toLowerCase().includes(needle) || column.type.toLowerCase().includes(needle))
            columns.push(column)

    function toggle(name: string) {
        setExpanded(current => {
            const next = new Set(current)

            if (next.has(name))
                next.delete(name)
            else
                next.add(name)

            return next
        })
    }

    return (
        <div className='flex flex-col gap-2 pt-2'>
            <SearchInput size='sm' placeholder='Filter by name or type' onSearch={setFilter} delay={100} wrapperClassName='px-3' />

            <div className='flex items-center justify-between gap-2 px-3 text-xs text-muted-foreground'>
                <span>
                    {columns.length === view.schema.columns.length
                        ? `${number(columns.length)} columns`
                        : `${number(columns.length)} of ${number(view.schema.columns.length)} columns`}
                    {stats && !outdated && ` · ${number(stats.rowCount)} rows`}
                </span>

                <Button
                    minimal
                    size='xs'
                    icon='calculator'
                    loading={statsRequest.isFetching}
                    disabled={view.files.length === 0}
                    onClick={() => void CatalogSDK.fetch({ ...CatalogSDK.query.columnStats(rid), staleTime: 0 })}
                >
                    {stats && !outdated ? 'Recompute stats' : 'Compute stats'}
                </Button>
            </div>

            {outdated && <p className='px-3 text-xs text-(--warning-foreground)'>Stats are from version {number(stats.sequence)}: recompute for the latest.</p>}

            <ul className='flex flex-col border-t border-border'>
                {columns.map(column => {
                    const columnStats = stats && !outdated ? stats.columns[column.name] : undefined
                    const isOpen = expanded.has(column.name)

                    return (
                        <li key={column.name} className='border-b border-border'>
                            <button
                                type='button'
                                aria-expanded={isOpen}
                                onClick={() => toggle(column.name)}
                                className='flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50'
                            >
                                <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={12} className='shrink-0 text-muted-foreground' />

                                <span className='flex min-w-0 flex-1 flex-col'>
                                    <span className='truncate text-sm font-medium' title={column.name}>{column.name}</span>
                                    <span className='flex items-center gap-1 text-xs text-muted-foreground'>
                                        <Icon name={typeIcon(column.type)} size={10} />
                                        {column.type}
                                    </span>
                                </span>

                                <span className='flex shrink-0 flex-col items-end text-xs'>
                                    <span className='text-muted-foreground'>NULL</span>
                                    <span>{columnStats && stats ? percent(columnStats.nullCount, stats.rowCount) : '—'}</span>
                                </span>
                            </button>

                            {isOpen && (
                                <Details className='px-3 pb-3 pl-8 text-xs'>
                                    <Detail label='Type'>{column.type}</Detail>
                                    <Detail label='Nullable'>{column.nullable ? 'Yes' : 'No'}</Detail>
                                    <Detail label='Nulls'>
                                        {columnStats && stats ? `${number(columnStats.nullCount)} of ${number(stats.rowCount)}` : '—'}
                                    </Detail>
                                    <Detail label='Distinct'>
                                        {columnStats ? `≈ ${number(columnStats.distinctCount)}` : '—'}
                                    </Detail>
                                </Details>
                            )}
                        </li>
                    )
                })}
            </ul>

            {columns.length === 0 && <p className='px-3 py-2 text-sm text-muted-foreground'>No column matches “{filter}”.</p>}
        </div>
    )
}

/** Foundry's type glyphs: quotes for text, 123 for numbers, a calendar for dates. */
function typeIcon(type: Catalog.ColumnSchema.Type): IconName {
    if (type === 'string')
        return 'citation'

    if (type === 'boolean')
        return 'tick'

    if (type === 'date')
        return 'calendar'

    if (type === 'timestamp')
        return 'time'

    if (type === 'binary')
        return 'document'

    return 'numerical'
}

/** "0%", "<0.1%", "12.3%" */
function percent(part: number, whole: number): string {
    if (whole === 0 || part === 0)
        return '0%'

    const share = (part / whole) * 100

    return share < 0.1 ? '<0.1%' : `${share.toFixed(1)}%`
}
