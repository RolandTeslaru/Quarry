import type { Catalog } from '@quarry/shared/domain';

/** A SQL string literal for DuckDB. */
export const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** A quoted identifier for DuckDB / Postgres. */
export const identifier = (value: string) => `"${value.replace(/"/g, '""')}"`;

/** DuckDB's view of a column type → the dataset type system. Unknown types become string, never dropped. */
export function toColumnType(duckType: string): Catalog.ColumnSchema.Type {
    const type = duckType.toUpperCase();
    const decimal = /^DECIMAL\((\d+),\s*(\d+)\)$/.exec(type);

    if (decimal)                                                                    return `decimal(${decimal[1]},${decimal[2]})`;
    if (['TINYINT', 'SMALLINT', 'INTEGER', 'UTINYINT', 'USMALLINT'].includes(type)) return 'integer';
    if (['BIGINT', 'UINTEGER', 'HUGEINT'].includes(type))                          return 'long';
    if (['FLOAT', 'DOUBLE', 'REAL'].includes(type))                                return 'double';
    if (type === 'BOOLEAN')                                                         return 'boolean';
    if (type === 'DATE')                                                            return 'date';
    if (type.startsWith('TIMESTAMP'))                                               return 'timestamp';
    if (type === 'BLOB')                                                            return 'binary';

    return 'string';                               // VARCHAR, UUID, JSON, enums, arrays… (nested types deferred)
}

/** The dataset type system → the DuckDB type to read a column as (CSV columns are cast to it). */
export function fromColumnType(type: Catalog.ColumnSchema.Type): string {
    const decimal = /^decimal\((\d+),(\d+)\)$/.exec(type);

    if (decimal)
        return `DECIMAL(${decimal[1]},${decimal[2]})`;

    const types: Record<string, string> = {
        string: 'VARCHAR', integer: 'INTEGER', long: 'BIGINT', double: 'DOUBLE',
        boolean: 'BOOLEAN', date: 'DATE', timestamp: 'TIMESTAMP', binary: 'BLOB',
    };

    return types[type] ?? 'VARCHAR';
}
