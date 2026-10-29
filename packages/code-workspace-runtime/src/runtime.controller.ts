import { spawn } from 'node:child_process';
import * as readline from 'node:readline';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Forge, Stdio } from '@quarry/shared/domain';
import { sendEvent } from '@quarry/shared/server/stdio/stdio-server';
import { System } from '@quarry/shared/server/system';

/** The image's `transform` user (docker/code-workspace-runtime/Dockerfile). Python never runs as the runtime. */
const TRANSFORM_USER = {
    uid:  1001,
    gid:  1001,
    home: '/home/transform',
};

/** The child's whole environment: nothing of the runtime's own is passed on. */
const TRANSFORM_ENV = {
    PATH: '/usr/local/bin:/usr/bin:/bin',
    HOME: TRANSFORM_USER.home,
};

/** Proves Python starts as the transform user with quarry.transforms; the transform itself runs from phase 2. */
const PYTHON_ARGS = ['-c', 'import os, quarry.transforms; print(f"python {os.getuid()}:{os.getgid()}")'];

@Controller()
export class RuntimeController {

    private readonly log = System.log.withContext('Run');

    @MessagePattern('run')
    public async run(@Payload() request: Forge.Runtime.Run.Request): Promise<Stdio.Payload<Forge.Runtime.Run.Response>> {
        this.log.info(`Running ${request.job.rid} (attempt ${request.job.attempt})`, {
            transform: request.recipe.runtime.transform,
        });

        const python = spawn('python3', PYTHON_ARGS, {
            uid:   TRANSFORM_USER.uid,
            gid:   TRANSFORM_USER.gid,
            cwd:   TRANSFORM_USER.home,
            env:   TRANSFORM_ENV,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        readline.createInterface({ input: python.stdout }).on('line', (line) => sendEvent({
            event:  'log',
            stream: 'stdout',
            line,
        }));

        readline.createInterface({ input: python.stderr }).on('line', (line) => sendEvent({
            event:  'log',
            stream: 'stderr',
            line,
        }));

        const code = await new Promise<number | null>((resolve, reject) => {
            python.on('error', reject);
            python.on('close', resolve);
        });

        if (code !== 0) {
            return {
                status:  'failed',
                failure: { message: `Python exited with code ${code}` },
            };
        }

        return {
            status:  'succeeded',
            failure: null,
        };
    }
}
