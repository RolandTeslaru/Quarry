import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { literal } from '@quarry/integrations/core/duckdb';
import { FileStorage } from '@/infra/file-storage';

/**
 * One in-memory DuckDB for the server, reading the dataset bucket — for what an
 * upload or a preview has to know about a file's contents (a CSV's columns and
 * dialect, a Parquet file's schema, the first rows). Short, user-facing reads
 * only; copying data stays in the Data Connection worker.
 */
@Injectable()
export class DuckDb implements OnModuleDestroy {

    private instance: Promise<DuckDBInstance> | undefined;

    constructor(private readonly files: FileStorage) {}

    /** A connection for `fn`, closed after. */
    async with<R>(fn: (connection: DuckDBConnection) => Promise<R>): Promise<R> {
        const connection = await (await (this.instance ??= this.create())).connect();

        try {
            return await fn(connection);
        }
        finally {
            connection.closeSync();
        }
    }

    async onModuleDestroy(): Promise<void> {
        if (this.instance)
            (await this.instance).closeSync();
    }

    private async create(): Promise<DuckDBInstance> {
        const instance = await DuckDBInstance.create(':memory:');
        const connection = await instance.connect();
        const { endpoint, useSsl, region, accessKey, secretKey, bucket } = this.files.settings;

        try {
            await connection.run('INSTALL httpfs; LOAD httpfs;');
            await connection.run(`
                CREATE OR REPLACE SECRET quarry_datasets (
                    TYPE      s3,
                    KEY_ID    ${literal(accessKey)},
                    SECRET    ${literal(secretKey)},
                    ENDPOINT  ${literal(endpoint)},
                    REGION    ${literal(region)},
                    URL_STYLE 'path',
                    USE_SSL   ${useSsl},
                    SCOPE     ${literal(`s3://${bucket}`)}
                )`);
        }
        finally {
            connection.closeSync();
        }

        return instance;
    }
}
