import { spawn } from 'node:child_process';
import * as readline from 'node:readline';
import type { Readable } from 'node:stream';
import { sendEvent } from '@quarry/shared/server/stdio/stdio-server';

/** A child process the runtime starts, and how it's run: every line it prints relayed to the job's log. */
export namespace Process {

    /** A process that exited with anything but 0: the job fails, naming it. */
    export class Failure extends Error {
        constructor(step: Step, code: number | null) {
            super(`${step.name} failed with exit code ${code}`);
        }
    }

    export interface Step {
        /** What the job's failure names: "Install the lock failed with exit code 1". */
        readonly name:     string;
        readonly command:  string;
        readonly args:     string[];
        /** Its whole environment: nothing of the runtime's own is inherited. */
        readonly env:      Record<string, string>;
        readonly cwd?:     string;
        /** Unset: the runtime itself (root). */
        readonly user?:    { readonly uid: number; readonly gid: number };
        /** Each line the child writes on file descriptor 3 (`QUARRY_EVENTS_FD`), if it has one. */
        readonly onEvent?: (line: string) => void;
    }

    /** Runs the step, each line it prints relayed as a `log` event. Throws a Failure unless it exits with 0. */
    export async function run(step: Step): Promise<void> {
        const child = spawn(step.command, step.args, {
            ...step.user,
            cwd:   step.cwd,
            env:   step.env,
            stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
        });

        // All piped, so none is null: stdout, stderr, and the events pipe on file descriptor 3.
        const stdout = child.stdio[1] as Readable;
        const stderr = child.stdio[2] as Readable;
        const events = child.stdio[3] as Readable;

        if (step.onEvent)
            readline.createInterface({ input: events }).on('line', step.onEvent);

        readline.createInterface({ input: stdout }).on('line', (line) => sendEvent({
            event:  'log',
            stream: 'stdout',
            line,
        }));

        readline.createInterface({ input: stderr }).on('line', (line) => sendEvent({
            event:  'log',
            stream: 'stderr',
            line,
        }));

        const code = await new Promise<number | null>((resolve, reject) => {
            child.on('error', reject);
            child.on('close', resolve);
        });

        if (code !== 0)
            throw new Failure(step, code);
    }
}
