import * as path from 'node:path';

/** The main server's migrations — every schema's, services' included (docs/design/architecture-split.md). src/ (dev) and dist/platform/server/src/ (build) both sit beside them. */
export const MIGRATIONS_FOLDER = path.resolve(__dirname, '../migrations');
