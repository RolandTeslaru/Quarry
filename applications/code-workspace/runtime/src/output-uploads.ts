import { createReadStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
import axios, { type AxiosInstance } from 'axios';
import { z } from 'zod';
import { type Dataset, Forge, Stdio } from '@quarry/shared/domain';

/** What Python announces on its events pipe when one of an output's files is complete. */
const FileReady = Stdio.Event.Base.extend({
    event:  z.literal('file-ready'),
    output: z.string(),
    path:   z.string(),
});
type FileReady = z.infer<typeof FileReady>;

/** An output as the runtime knows it: its dataset, and the folder Python writes its files into. */
export interface OutputFolder {
    readonly datasetRid: Dataset.Rid;
    readonly directory:  string;
}

/**
 * A job's output files, uploaded one at a time as Python announces them, while it writes the next: an upload
 * pass, a PUT straight to storage, then registering the file. The first failure stops the uploads; `finish`
 * waits for the last and says what failed, if anything.
 */
export class OutputUploads {

    private readonly ready: FileReady[] = [];

    private wake: (() => void) | null = null;

    private closed = false;

    private failure: string | null = null;

    private readonly uploading: Promise<void>;

    constructor(
        private readonly api:     AxiosInstance,
        private readonly jobRid:  Forge.Job.Rid,
        private readonly outputs: Record<string, OutputFolder>,
    ) {
        this.uploading = this.uploadAll();
    }

    /** One line from Python's events pipe. Never throws: it runs in the pipe's handler. */
    public announce(line: string): void {
        let file: FileReady;

        try {
            file = FileReady.parse(JSON.parse(line));
        }
        catch {
            this.failure ??= `The transform wrote something that isn't a file-ready event: ${line.slice(0, 200)}`;

            return;
        }

        const output = this.outputs[file.output];

        // Python runs the workspace's code, and this runtime uploads as root: only an output's own Parquet files go.
        if (!output || path.dirname(file.path) !== output.directory || !file.path.endsWith('.parquet')) {
            this.failure ??= `The transform announced ${file.path}, which isn't a file of output ${file.output}`;

            return;
        }

        this.ready.push(file);
        this.wake?.();
    }

    /** After Python exits: waits for the last uploads. The first failure, or null. */
    public async finish(): Promise<string | null> {
        this.closed = true;
        this.wake?.();

        await this.uploading;

        return this.failure;
    }

    private async uploadAll(): Promise<void> {
        for (;;) {
            const file = this.ready.shift();

            if (!file) {
                if (this.closed)
                    return;

                await new Promise<void>((resolve) => {
                    this.wake = resolve;
                });

                this.wake = null;

                continue;
            }

            if (this.failure)
                continue;

            try {
                await this.upload(file);
            }
            catch (error) {
                const reason = error instanceof Error ? error.message : String(error);

                this.failure = `Uploading ${file.path} failed: ${reason}`;
            }
        }
    }

    private async upload(file: FileReady): Promise<void> {
        const { datasetRid } = this.outputs[file.output];
        const filename = path.basename(file.path);
        const { size } = await fs.stat(file.path);
        const { url } = await Forge.API.createUploadPass(this.api, this.jobRid, datasetRid, { filename });

        await axios.put(url, createReadStream(file.path), {
            headers:          { 'content-length': String(size) },
            maxBodyLength:    Infinity,
            maxContentLength: Infinity,
        });

        await Forge.API.registerOutputFile(this.api, this.jobRid, datasetRid, {
            filename,
            bytes: size,
        });
    }
}
