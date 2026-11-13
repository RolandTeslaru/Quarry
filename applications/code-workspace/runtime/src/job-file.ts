import * as path from 'node:path';
import type { Catalog, Forge } from '@quarry/shared/domain';
import { OUTPUTS } from './container';
import type { OutputFolder } from './output-uploads';

type RuntimeConfig = Extract<Forge.Recipe.RuntimeConfig, { type: 'code-workspace' }>;

/** JOB_FILE's contents, read by `quarry.transforms.run`: the transform, and its inputs and outputs by parameter. */
export interface JobFile {
    readonly jobRid:    string;
    readonly transform: string;
    readonly inputs:    Record<string, JobFile.Input>;
    readonly outputs:   Record<string, { readonly rid: string; readonly directory: string }>;
}

export namespace JobFile {

    /** One input: its pinned version's files as signed read URLs, and the schema that says how to read them. */
    export interface Input {
        readonly rid:      string;
        readonly sequence: number;
        readonly files:    string[];
        readonly schema:   Catalog.ColumnSchema | null;
    }

    /** The job file for this recipe's transform: each input from its signed read URLs, each output a folder of its own. */
    export function create(
        jobRid:        Forge.Job.Rid,
        runtimeConfig: RuntimeConfig,
        inputUrls:     Forge.API.Runtime.GetSignedInputUrls.Response['inputs'],
    ): JobFile {
        const jobFile: JobFile = {
            jobRid,
            transform: runtimeConfig.transform,
            inputs:    {},
            outputs:   {},
        };

        for (const [parameter, datasetRid] of Object.entries(runtimeConfig.inputs)) {
            const signed = inputUrls[datasetRid];
            const files: string[] = [];

            for (const file of signed.files)
                files.push(file.url);

            jobFile.inputs[parameter] = {
                rid:      datasetRid,
                sequence: signed.sequence,
                files,
                schema:   signed.schema,
            };
        }

        for (const [parameter, datasetRid] of Object.entries(runtimeConfig.outputs))
            jobFile.outputs[parameter] = {
                rid:       datasetRid,
                directory: path.join(OUTPUTS, parameter),
            };

        return jobFile;
    }

    /** Each output's folder, as the uploads watch them: the same folders the job file gives Python. */
    export function getOutputFolders(runtimeConfig: RuntimeConfig): Record<string, OutputFolder> {
        const folders: Record<string, OutputFolder> = {};

        for (const [parameter, datasetRid] of Object.entries(runtimeConfig.outputs))
            folders[parameter] = {
                datasetRid,
                directory: path.join(OUTPUTS, parameter),
            };

        return folders;
    }
}
