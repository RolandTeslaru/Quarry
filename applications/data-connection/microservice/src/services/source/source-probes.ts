import { HttpException, HttpStatus, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { DuckDBInstance } from '@duckdb/node-api';
import type { DataConnection, Keychain } from '@quarry/shared/domain';
import { decryptCredential } from '@quarry/integrations/core/decrypt-credential';
import { findDefinition } from '@quarry/integrations/definitions';
import { SOURCE_RUNTIMES, type SourceRuntime } from '@quarry/integrations/runtimes';

type Probed = Pick<DataConnection.Source, 'rid' | 'definitionId' | 'config'>;
type Credential = Keychain.Credential.Encrypted | null;

/**
 * Asking a source system something while a user waits, through its integration's runtime — this service
 * opens the connection itself. The credential is decrypted for the runtime, and lives in memory only for the
 * probe. A source's failure is a 424: what the service depended on failed, with the reason passed on.
 */
@Injectable()
export class SourceProbes implements OnModuleDestroy {

    private instance: Promise<DuckDBInstance> | undefined;

    /** open → close: opening is the test. A failed test is an answer, not an error. */
    public async test(source: Probed, credential: Credential): Promise<DataConnection.API.Source.Test.Response> {
        try {
            await this.with(source, credential, async () => undefined);

            return { ok: true, error: null };
        }
        catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    public async explore(source: Probed, credential: Credential): Promise<DataConnection.Source.Table[]> {
        return this.with(source, credential, (runtime) => {
            if (!runtime.explore)
                throw new Error(`Source type '${source.definitionId}' can't be explored`);

            return runtime.explore();
        });
    }

    public async preview(source: Probed, credential: Credential, table: DataConnection.Source.Table, limit: number): Promise<DataConnection.Source.TablePreview> {
        return this.with(source, credential, (runtime) => {
            if (!runtime.preview)
                throw new Error(`Source type '${source.definitionId}' can't be previewed`);

            return runtime.preview(table, limit);
        });
    }

    public async onModuleDestroy(): Promise<void> {
        if (this.instance)
            (await this.instance).closeSync();
    }

    /** open → fn → close; close runs even if open or fn throws. */
    private async with<R>(source: Probed, credential: Credential, fn: (runtime: SourceRuntime) => Promise<R>): Promise<R> {
        const definition = findDefinition(source.definitionId)!;
        const Runtime = SOURCE_RUNTIMES[source.definitionId];
        const values = decryptCredential(source, definition, credential);
        const runtime = new Runtime(source.rid, definition.Config.parse(source.config) as never, values as never, {
            duckdb: await (this.instance ??= this.createInstance()),
        });

        try {
            await runtime.open();

            return await fn(runtime);
        }
        catch (error) {
            throw new HttpException(error instanceof Error ? error.message : String(error), HttpStatus.FAILED_DEPENDENCY);
        }
        finally {
            await runtime.close();
        }
    }

    private async createInstance(): Promise<DuckDBInstance> {
        const instance = await DuckDBInstance.create(':memory:');
        const connection = await instance.connect();

        await connection.run('INSTALL postgres; LOAD postgres;');
        connection.closeSync();

        return instance;
    }
}
