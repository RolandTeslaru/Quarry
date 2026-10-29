import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Forge, Stdio } from '@quarry/shared/domain';
import { requireEnv } from '@quarry/shared/server/env';
import { sendEvent } from '@quarry/shared/server/stdio/stdio-server';
import { System } from '@quarry/shared/server/system';

/** The image's `transform` user (docker/code-workspace-runtime/Dockerfile): the workspace's code runs as it. */
const TRANSFORM_USER = {
    uid:  1001,
    gid:  1001,
    home: '/home/transform',
};

/** Where the workspace is checked out: by root, readable by `transform`, never written by it. */
const CHECKOUT = '/work/repo';

/** The workspace's environment: `transform`'s own, so nothing is written into the checkout. */
const VENV = `${TRANSFORM_USER.home}/venv`;

/** The cache volume the ForgeAgent mounts for this runtime type, owned by `transform` (the image's `/cache`). */
const CACHE = '/cache';

const PATH = '/usr/local/bin:/usr/bin:/bin';

/** A root step's whole environment. */
const ROOT_ENV = {
    PATH,
    HOME:                '/root',
    GIT_TERMINAL_PROMPT: '0',
};

/** A transform step's whole environment: nothing of the runtime's own is passed on. */
const TRANSFORM_ENV = {
    PATH,
    HOME:                   TRANSFORM_USER.home,
    UV_CACHE_DIR:           `${CACHE}/uv`,
    UV_PROJECT_ENVIRONMENT: VENV,
    UV_LINK_MODE:           'copy',          // the cache is another filesystem
    UV_PYTHON_DOWNLOADS:    'never',         // the image's Python
};

interface Step {
    readonly name:    string;
    readonly command: string;
    readonly args:    string[];
    readonly env:     Record<string, string>;
    readonly cwd?:    string;
    /** Unset: the runtime itself (root). */
    readonly user?:   { readonly uid: number; readonly gid: number };
}

/** Runs a step as a child process, every line it prints relayed as a `log` event. Its exit code. */
function runStep(step: Step): Promise<number | null> {
    const child = spawn(step.command, step.args, {
        ...step.user,
        cwd:   step.cwd,
        env:   step.env,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    readline.createInterface({ input: child.stdout }).on('line', (line) => sendEvent({
        event:  'log',
        stream: 'stdout',
        line,
    }));

    readline.createInterface({ input: child.stderr }).on('line', (line) => sendEvent({
        event:  'log',
        stream: 'stderr',
        line,
    }));

    return new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', resolve);
    });
}

@Controller()
export class RuntimeController {

    private readonly log = System.log.withContext('Run');

    @MessagePattern('run')
    public async run(@Payload() request: Forge.Runtime.Run.Request): Promise<Stdio.Payload<Forge.Runtime.Run.Response>> {
        const { job, recipe, token } = request;
        const { workspaceRid, commit, transform } = recipe.runtime;

        this.log.info(`Running ${job.rid} (attempt ${job.attempt})`, {
            transform,
            commit,
        });

        const repository = `${requireEnv('QUARRY_SERVER_URL')}/api/git/${workspaceRid}.git`;
        const transformUser = {
            uid: TRANSFORM_USER.uid,
            gid: TRANSFORM_USER.gid,
        };

        const steps: Step[] = [
            {
                name:    'Clone',
                command: 'git',
                args:    ['clone', '--quiet', '--no-checkout', repository, CHECKOUT],
                env:     {
                    ...ROOT_ENV,
                    // The token goes to this git process only: not on disk, not in its arguments.
                    GIT_CONFIG_COUNT:   '1',
                    GIT_CONFIG_KEY_0:   'http.extraHeader',
                    GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}`,
                },
            },
            {
                name:    'Check out',
                command: 'git',
                args:    ['-C', CHECKOUT, 'checkout', '--quiet', '--detach', commit],
                env:     ROOT_ENV,
            },
            {
                name:    'Create the environment',
                command: 'uv',
                args:    ['venv', '--quiet', '--system-site-packages', VENV],
                env:     TRANSFORM_ENV,
                cwd:     CHECKOUT,
                user:    transformUser,
            },
            {
                name:    'Install the lock',
                command: 'uv',
                args:    ['sync', '--frozen', '--no-dev'],
                env:     TRANSFORM_ENV,
                cwd:     CHECKOUT,
                user:    transformUser,
            },
            {
                name:    'Run the transform',
                command: path.join(VENV, 'bin/python'),
                args:    ['-m', 'quarry.transforms.run', transform],
                env:     TRANSFORM_ENV,
                cwd:     CHECKOUT,
                user:    transformUser,
            },
        ];

        for (const step of steps) {
            const code = await runStep(step);

            if (code !== 0) {
                return {
                    status:  'failed',
                    failure: { message: `${step.name} failed with exit code ${code}` },
                };
            }
        }

        return {
            status:  'succeeded',
            failure: null,
        };
    }
}
