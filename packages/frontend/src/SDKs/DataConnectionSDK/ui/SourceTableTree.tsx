import { useState } from 'react'
import { Icon } from '@quarry/standard-ui/icons'
import type { DataConnection } from '@quarry/shared/domain'
import { Tree } from '@/components/Tree'
import { matchesSearch } from '@/hooks/useSearch'

interface Props {
    tables:   DataConnection.Source.Table[]
    selected: DataConnection.Source.Table | null
    /** The search box's text: a schema matching shows all its tables; otherwise only the matching ones. */
    query:    string
    onSelect: (table: DataConnection.Source.Table) => void
}

/**
 * A source's tables as a tree: each schema once, its tables under it. The
 * picked table's schema starts open; while searching, every schema with a match is open.
 */
export function SourceTableTree({ tables, selected, query, onSelect }: Props) {
    const schemas = Object.entries(bySchema(tables))
        .map(([schema, tables]) => ({
            schema,
            tables: matchesSearch(schema, query) ? tables : tables.filter(table => matchesSearch(`${schema}.${table.name}`, query)),
        }))
        .filter(group => group.tables.length > 0)

    if (schemas.length === 0)
        return <p className='text-xs text-muted-foreground'>No table matches “{query}”.</p>

    return (
        <Tree.Root size='sm' aria-label='Source tables'>
            {schemas.map((group, index) => (
                <SchemaItem
                    key={group.schema}
                    schema={group.schema}
                    tables={group.tables}
                    isLast={index === schemas.length - 1}
                    selected={selected}
                    searching={query.trim() !== ''}
                    onSelect={onSelect}
                />
            ))}
        </Tree.Root>
    )
}

interface SchemaItemProps {
    schema:    string
    tables:    DataConnection.Source.Table[]
    isLast:    boolean
    selected:  DataConnection.Source.Table | null
    searching: boolean
    onSelect:  (table: DataConnection.Source.Table) => void
}

function SchemaItem({ schema, tables, isLast, selected, searching, onSelect }: SchemaItemProps) {
    const [expanded, setExpanded] = useState(selected?.schema === schema)

    const open = expanded || searching

    return (
        <Tree.Item
            isLast={isLast}
            expanded={open}
            onToggle={() => setExpanded(!open)}
            toggleLabel={open ? `Collapse ${schema}` : `Expand ${schema}`}
            label={(
                <>
                    <Icon name='database' size={12} className='mr-1.5 shrink-0 text-muted-foreground' />
                    <span className='min-w-0 flex-1 truncate font-mono'>{schema}</span>
                    <span className='shrink-0 pr-1 text-xs text-muted-foreground'>{tables.length}</span>
                </>
            )}
        >
            {tables.map((table, index) => (
                <Tree.Item
                    key={table.name}
                    isLast={index === tables.length - 1}
                    active={selected?.schema === table.schema && selected.name === table.name}
                    onClick={() => onSelect(table)}
                    label={(
                        <>
                            <Icon name='th' size={12} className='mr-1.5 shrink-0 text-muted-foreground' />
                            <span className='min-w-0 flex-1 truncate font-mono' title={`${table.schema}.${table.name}`}>{table.name}</span>
                        </>
                    )}
                />
            ))}
        </Tree.Item>
    )
}

/** Each schema's tables, schemas in the order the source lists them. */
function bySchema(tables: DataConnection.Source.Table[]): Record<string, DataConnection.Source.Table[]> {
    const schemas: Record<string, DataConnection.Source.Table[]> = {}

    for (const table of tables)
        (schemas[table.schema] ??= []).push(table)

    return schemas
}
