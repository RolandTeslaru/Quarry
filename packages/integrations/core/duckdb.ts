/** A SQL string literal for DuckDB. */
export const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** A quoted identifier for DuckDB / Postgres. */
export const identifier = (value: string) => `"${value.replace(/"/g, '""')}"`;
