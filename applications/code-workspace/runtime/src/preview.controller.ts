import { type ChildProcess, spawn } from 'node:child_process';
import * as path from 'node:path';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CodeTransform, CodeWorkspace, type Stdio } from '@quarry/shared/domain';

import Calls = CodeWorkspace.Runtime;

/** Importing the pipeline, to list its transforms. */
const LIST_TIMEOUT_MS = 60_000;

/** Sampling every input, then running the transform. */
const PREVIEW_TIMEOUT_MS = 300_000;

interface Output {
    readonly stdout: string;
    readonly stderr: string;
    readonly code:   number | null;
}

/** `python -m quarry.transforms.preview …` from the working copy's own environment, its whole output collected. */
function spawnPreview(folder: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number) {
    const child = spawn(path.join(folder, '.venv', 'bin', 'python'), ['-m', 'quarry.transforms.preview', ...args], {
        cwd:     folder,
        env,
        timeout: timeoutMs,
        stdio:   ['ignore', 'pipe', 'pipe'],
    });

    const output = new Promise<Output>((resolve, reject) => {
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk: Buffer) => {
            stdout += chunk;
        });

        child.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk;
        });

        child.on('error', reject);
        child.on('close', (code) => resolve({ stdout, stderr, code }));
    });

    return { child, output };
}

/**
 * What a session's IDE asks: its transforms and previews of them, from the
 * working copy. The runtime runs in the session's container, as the session's
 * user, so the token is the user's own and Python runs as them too.
 */
@Controller()
export class PreviewController {

    private running: ChildProcess | null = null;

    /** Previews stopped on purpose — by `cancel`, or by a newer preview — rather than failed. */
    private readonly stopped = new WeakSet<ChildProcess>();

    @MessagePattern('describe')
    public async describe(@Payload() request: Calls.Describe.Request): Promise<Stdio.Payload<Calls.Describe.Response>> {
        const { output } = spawnPreview(request.folder, ['--list'], process.env, LIST_TIMEOUT_MS);
        const { stdout, stderr, code } = await output;

        // A pipeline that doesn't import exits 1 with `{ error }` on stdout: an answer, not a failure.
        if (!stdout.trim())
            throw new Error(stderr.trim() || `Listing the transforms printed nothing (exit code ${code})`);

        return { listing: CodeTransform.Listing.parse(JSON.parse(stdout)) };
    }

    @MessagePattern('preview')
    public async preview(@Payload() request: Calls.Preview.Request): Promise<Stdio.Payload<Calls.Preview.Response>> {
        this.cancel();

        const env = {
            ...process.env,
            QUARRY_TOKEN:      request.session.token,
            QUARRY_SERVER_URL: request.session.serverUrl,
        };
        const args = [request.transform, '--rows', String(request.rows)];
        const { child, output } = spawnPreview(request.folder, args, env, PREVIEW_TIMEOUT_MS);

        this.running = child;

        const { stdout, stderr, code } = await output;

        if (this.running === child)
            this.running = null;

        if (this.stopped.has(child))
            return { result: null };

        // A transform that raised exits 1 with its JSON: the answer, not a failure.
        if (!stdout.trim())
            throw new Error(stderr.trim() || `The preview printed no result (exit code ${code})`);

        return { result: CodeWorkspace.Preview.Result.parse(JSON.parse(stdout)) };
    }

    @MessagePattern('cancel')
    public cancel(): Stdio.Payload<Calls.Cancel.Response> {
        if (this.running) {
            this.stopped.add(this.running);
            this.running.kill();
            this.running = null;
        }

        return {};
    }
}
