/// <reference types="node" />
import type { ChildProcessByStdio } from 'node:child_process';
import * as readline from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { z } from 'zod';
import { Stdio } from '../../domain';

/** A runtime process: stdin and stdout piped to its caller, stderr wherever the caller chose. */
export type RuntimeProcess = ChildProcessByStdio<Writable, Readable, null>;

/** A domain's call: its request and response schemas, as `Forge.Runtime.Run`. */
export interface Call {
    readonly Request:  Stdio.Request.Schema;
    readonly Response: Stdio.Response.Schema;
}

interface Pending {
    readonly resolve: (response: unknown) => void;
    readonly reject:  (error: Error) => void;
}

/**
 * The caller's side of a runtime's stdio: requests out on its stdin, responses
 * and events in from its stdout. If the process exits, everything still
 * waiting fails with its exit code.
 */
export class StdioClient {

    private nextId = 1;

    private readonly pending: Record<number, Pending> = {};

    private readonly ready: Promise<Stdio.Event.Ready>;

    constructor(
        private readonly process: RuntimeProcess,
        private readonly onLog:   (log: Stdio.Event.Log) => void,
    ) {
        this.ready = new Promise((resolveReady, rejectReady) => {
            const lines = readline.createInterface({ input: process.stdout });

            // A line that breaks the protocol fails this runtime, not the caller's process.
            let broken: Error | null = null;

            lines.on('line', (line) => {
                try {
                    const raw: unknown = JSON.parse(line);
                    const message = Stdio.FromProcess.parse(raw);

                    if (message.type === 'response') {
                        this.pending[message.id].resolve(raw);
                        delete this.pending[message.id];
                    }
                    else if (message.type === 'error') {
                        this.pending[message.id].reject(new Error(message.message));
                        delete this.pending[message.id];
                    }
                    else {
                        const event = Stdio.Event.Schema.parse(raw);

                        if (event.event === 'ready')
                            resolveReady(event);
                        else
                            this.onLog(event);
                    }
                }
                catch (error) {
                    const reason = error instanceof Error ? error.message : String(error);

                    broken = new Error(`The runtime broke the protocol: ${reason}`);
                    process.kill();
                }
            });

            process.on('close', (code) => {
                const error = broken ?? new Error(`The runtime exited with code ${code}`);

                rejectReady(error);

                for (const [id, waiting] of Object.entries(this.pending)) {
                    waiting.reject(error);
                    delete this.pending[Number(id)];
                }
            });

            process.on('error', rejectReady);
        });
    }

    /** Waits for the runtime's `ready`, and refuses one that isn't `runtime` or speaks another protocol. */
    public async waitUntilReady(runtime: string): Promise<void> {
        const ready = await this.ready;

        const expected = `the ${runtime} runtime on protocol ${Stdio.PROTOCOL}`;

        if (ready.runtime !== runtime || ready.protocol !== Stdio.PROTOCOL)
            throw new Error(`Expected ${expected}, got ${ready.runtime} on protocol ${ready.protocol}`);
    }

    public async request<C extends Call>(
        call:    C,
        payload: Stdio.Payload<z.input<C['Request']>>,
    ): Promise<z.infer<C['Response']>> {
        const id = this.nextId++;

        const response = new Promise<unknown>((resolve, reject) => {
            this.pending[id] = {
                resolve,
                reject,
            };
        });

        const message = {
            ...payload,
            type:    'request',
            id,
            pattern: call.Request.shape.pattern.value,
        };

        this.process.stdin.write(`${JSON.stringify(message)}\n`);

        return z.parse<C['Response']>(call.Response, await response);
    }

    /** Closes the runtime's stdin: it finishes and exits. */
    public close(): void {
        this.process.stdin.end();
    }
}
