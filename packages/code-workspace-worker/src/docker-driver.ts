import { execFile } from 'node:child_process';
import { Injectable } from '@nestjs/common';

/** Most docker commands answer at once; starting or setting up a session may take minutes. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Large enough for a preview's JSON (a thousand rows per output). */
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

export interface ExecResult {
    readonly code:   number;
    readonly stdout: string;
    readonly stderr: string;
}

/** A container, as `docker ps` lists it. */
export interface ContainerInfo {
    readonly name:    string;
    readonly running: boolean;
    readonly labels:  Record<string, string>;
}

export interface RunOptions {
    readonly name:    string;
    readonly image:   string;
    readonly labels:  Record<string, string>;
    /** Passed by name only — the values reach docker through its own environment, never its argument list. */
    readonly env:     Record<string, string>;
    readonly volume:  { readonly name: string; readonly target: string };
    /** Published on 127.0.0.1 only, on a free port. */
    readonly port:    number;
    readonly memory:  string;
    readonly cpus:    number;
}

export interface ExecOptions {
    readonly env?:       Record<string, string>;
    readonly workdir?:   string;
    readonly timeoutMs?: number;
}

/** The `docker` CLI, as the code workspace worker needs it. Fails with docker's own message. */
@Injectable()
export class DockerDriver {

    public async run(options: RunOptions): Promise<void> {
        const args = ['run', '--detach', '--name', options.name];

        for (const [key, value] of Object.entries(options.labels))
            args.push('--label', `${key}=${value}`);

        for (const key of Object.keys(options.env))
            args.push('--env', key);

        args.push(
            '--add-host', 'host.docker.internal:host-gateway',        // the server, as sessions reach it
            '--publish', `127.0.0.1::${options.port}`,
            '--volume', `${options.volume.name}:${options.volume.target}`,
            '--memory', options.memory,
            '--cpus', String(options.cpus),
            options.image,
        );

        await this.command(args, { env: options.env });
    }

    public async start(name: string): Promise<void> {
        await this.command(['start', name]);
    }

    public async stop(name: string): Promise<void> {
        await this.command(['stop', name]);
    }

    /** Stops and deletes the container; its named volumes stay. */
    public async remove(name: string): Promise<void> {
        await this.command(['rm', '--force', name]);
    }

    /** Where the container's port is published on this host. */
    public async getHostPort(name: string, containerPort: number): Promise<number> {
        const output = await this.command(['port', name, String(containerPort)]);
        const port = Number(output.split('\n')[0]?.split(':').pop());

        if (!Number.isInteger(port))
            throw new Error(`${name} doesn't publish ${containerPort}`);

        return port;
    }

    /** Every container (running or not) with the label. */
    public async list(label: string): Promise<ContainerInfo[]> {
        const output = await this.command(['ps', '--all', '--filter', `label=${label}`, '--format', '{{json .}}']);

        return output
            .split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => JSON.parse(line) as { Names: string; State: string; Labels: string })
            .map(container => ({
                name:    container.Names,
                running: container.State === 'running',
                labels:  parseLabels(container.Labels),
            }));
    }

    /** Runs a command in the container; a non-zero exit is a result, not an error. */
    public exec(name: string, command: string[], options: ExecOptions = {}): Promise<ExecResult> {
        const env = options.env ?? {};
        const args = ['exec'];

        for (const key of Object.keys(env))
            args.push('--env', key);

        if (options.workdir)
            args.push('--workdir', options.workdir);

        args.push(name, ...command);

        return new Promise((resolve, reject) => {
            execFile('docker', args, {
                env:       { ...process.env, ...env },
                timeout:   options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
                maxBuffer: MAX_OUTPUT_BYTES,
            }, (error, stdout, stderr) => {
                if (error && typeof error.code !== 'number')
                    return reject(error);                                   // docker itself failed (timeout, not found)

                resolve({ code: error ? Number(error.code) : 0, stdout, stderr });
            });
        });
    }

    private command(args: string[], options: { env?: Record<string, string>; timeoutMs?: number } = {}): Promise<string> {
        return new Promise((resolve, reject) => {
            execFile('docker', args, {
                env:     { ...process.env, ...options.env },
                timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            }, (error, stdout, stderr) => {
                if (error)
                    return reject(new Error(`docker ${args[0]}: ${stderr.trim() || error.message}`));

                resolve(stdout.trim());
            });
        });
    }
}

/** `a=1,b=2` — label values are ours (RIDs, hex), never commas. */
function parseLabels(labels: string): Record<string, string> {
    return Object.fromEntries(
        labels
            .split(',')
            .filter(pair => pair.includes('='))
            .map(pair => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]),
    );
}
