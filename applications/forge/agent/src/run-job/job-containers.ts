import { execFile, spawn } from 'node:child_process';
import { Injectable } from '@nestjs/common';
import { Forge, Stdio } from '@quarry/shared/domain';
import { StdioClient } from '@quarry/shared/server/stdio/stdio-client';

/** Each runtime type's image, tagged RUNTIME_TAG. */
const RUNTIME_IMAGES: Record<Forge.Recipe.Runtime['type'], string> = {
    'code-workspace': 'quarry/code-workspace-runtime',
};

/** The runtime images' tag: the agent's release, so the two always match. */
const RUNTIME_TAG = process.env.FORGE_AGENT_RUNTIME_TAG ?? 'dev';

/** The main server, as a job container reaches it (its runtime calls Forge through the proxy): the agent's machine, by default. */
const JOB_SERVER_URL = process.env.FORGE_AGENT_JOB_SERVER_URL ?? 'http://host.docker.internal:4000';

const getContainerName = (job: Forge.Job): string => `forge-${job.rid}-${job.attempt}`;

/**
 * One container per job, its runtime as the main process. The runtime may only
 * switch users (to run Python as `transform`); every other capability is dropped.
 */
@Injectable()
export class JobContainers {

    public start(
        job:    Forge.Job,
        recipe: Forge.Recipe,
        onLog:  (log: Stdio.Event.Log) => void,
    ): StdioClient {
        const container = spawn('docker', [
            'run',
            '--interactive',
            '--rm',
            '--name', getContainerName(job),
            '--label', `quarry.forge-job=${job.rid}`,
            '--add-host', 'host.docker.internal:host-gateway',
            '--env', `QUARRY_SERVER_URL=${JOB_SERVER_URL}`,
            '--cpus', String(recipe.compute.cpuCores),
            '--memory', `${recipe.compute.memoryGb}g`,
            '--volume', `quarry-cache-${recipe.runtime.type}:/cache`,
            '--cap-drop', 'ALL',
            '--cap-add', 'SETUID',
            '--cap-add', 'SETGID',
            '--security-opt', 'no-new-privileges',
            `${RUNTIME_IMAGES[recipe.runtime.type]}:${RUNTIME_TAG}`,
        ], { stdio: ['pipe', 'pipe', 'inherit'] });

        return new StdioClient(container, onLog);
    }

    public kill(job: Forge.Job): Promise<void> {
        return new Promise((resolve, reject) => {
            execFile('docker', ['kill', getContainerName(job)], (error, _stdout, stderr) => {
                if (error)
                    return reject(new Error(`docker kill: ${stderr.trim() || error.message}`));

                resolve();
            });
        });
    }
}
