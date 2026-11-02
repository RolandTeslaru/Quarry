import { createReadStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { DuckDBInstance } from '@duckdb/node-api';
import axios, { type AxiosInstance } from 'axios';
import { DataConnection, type Dataset, Forge, Stdio } from '@quarry/shared/domain';
import { requireEnv } from '@quarry/shared/server/env';
import { sendEvent } from '@quarry/shared/server/stdio/stdio-server';
import { System } from '@quarry/shared/server/system';
import { findDefinition } from '@quarry/integrations/definitions';
import { SOURCE_RUNTIMES } from '@quarry/integrations/runtimes';

/** Where the copy writes its Parquet files, before they're uploaded. The trailing slash is the runtime's contract (SyncRunContext). */
const OUTPUT = '/tmp/out/';

/**
 * One sync: the job's source and credential from Data Connection, the copy to a local folder through its
 * integration, then each file uploaded through a signed URL and registered on the output's open transaction.
 * The job's token is the runtime's own. Forge commits the files with the job, and how far it got with them.
 */
@Controller()
export class RuntimeController {

    private readonly log = System.log.withContext('Run');

    @MessagePattern('run')
    public async run(@Payload() request: Forge.Runtime.Run.Request): Promise<Stdio.Payload<Forge.Runtime.Run.Response>> {
        const { job, recipe, token, incrementalStates } = request;
        // The agent starts this image for this runtime type only.
        const { syncConfig } = recipe.runtimeConfig as Extract<Forge.Recipe.RuntimeConfig, { type: 'data-connection' }>;
        const [datasetRid] = Object.keys(recipe.outputTransactions) as Dataset.Rid[];

        this.log.info(`Running ${job.rid} (attempt ${job.attempt})`);

        const api = axios.create({
            baseURL: requireEnv('QUARRY_SERVER_URL'),
            headers: { authorization: `Bearer ${token}` },
        });
        const { source, credential } = await DataConnection.API.Runtime.getConnection(api, job.rid);
        const definition = findDefinition(source.definitionId)!;
        const Runtime = SOURCE_RUNTIMES[source.definitionId];
        const instance = await DuckDBInstance.create(':memory:');
        const setup = await instance.connect();

        // Installed in the image: a job doesn't download anything.
        await setup.run('LOAD postgres');
        setup.closeSync();

        const runtime = new Runtime(source.rid, definition.Config.parse(source.config) as never, credential as never, { duckdb: instance });

        await fs.mkdir(OUTPUT, { recursive: true });

        try {
            await runtime.open();

            const copied = await runtime.sync(definition.sync.Config.parse(syncConfig) as never, {
                destination: OUTPUT,
                state:       incrementalStates[datasetRid] ?? null,
            });

            sendEvent({ event: 'log', stream: 'stdout', line: `Copied ${copied.rowCount} rows` });

            await this.uploadFiles(api, job.rid, datasetRid);

            return {
                status:            'succeeded',
                failure:           null,
                incrementalStates: { [datasetRid]: copied.state },
            };
        }
        finally {
            await runtime.close();
            instance.closeSync();
        }
    }

    /** Every file the copy wrote: a signed URL, a PUT straight to storage, then registering it. */
    private async uploadFiles(api: AxiosInstance, jobRid: Forge.Job.Rid, datasetRid: Dataset.Rid): Promise<void> {
        for (const filename of await fs.readdir(OUTPUT)) {
            const file = path.join(OUTPUT, filename);
            const { size } = await fs.stat(file);
            const { url } = await Forge.API.Runtime.getSignedOutputUrl(api, jobRid, datasetRid, { filename });

            await axios.put(url, createReadStream(file), {
                headers:          { 'content-length': String(size) },
                maxBodyLength:    Infinity,
                maxContentLength: Infinity,
            });

            await Forge.API.Runtime.registerOutputFile(api, jobRid, datasetRid, { filename, bytes: size });
        }
    }
}
