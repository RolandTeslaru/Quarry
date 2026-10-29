import { execFile, spawn } from 'node:child_process';
import { Injectable } from '@nestjs/common';
import { Forge, Stdio } from '@quarry/shared/domain';
import { StdioClient } from '@quarry/shared/server/stdio/stdio-client';

/** Each runtime type's image. The tag is the agent's release (FORGE_AGENT_RUNTIME_TAG), so the two always match. */
const RUNTIME_IMAGES: Record<Forge.Recipe.Runtime['type'], string> = {
    'code-workspace': 'quarry/code-workspace-runtime',
};

const getContainerName = (job: Forge.Job.Schema): string => `forge-${job.rid}-${job.attempt}`;

/**
 * One container per job, its runtime as the main process. The runtime may only
 * switch users (to run Python as `transform`); every other capability is dropped.
 */
@Injectable()
export class JobContainers {

    public start(
        job:    Forge.Job.Schema,
        recipe: Forge.Recipe.Schema,
        onLog:  (log: Stdio.Event.Log) => void,
    ): StdioClient {
        const tag = process.env.FORGE_AGENT_RUNTIME_TAG ?? 'dev';

        const container = spawn('docker', [
            'run',
            '--interactive',
            '--rm',
            '--name', getContainerName(job),
            '--label', `quarry.forge-job=${job.rid}`,
            '--cpus', String(recipe.compute.cpuCores),
            '--memory', `${recipe.compute.memoryGb}g`,
            '--volume', `quarry-cache-${recipe.runtime.type}:/cache`,
            '--cap-drop', 'ALL',
            '--cap-add', 'SETUID',
            '--cap-add', 'SETGID',
            '--security-opt', 'no-new-privileges',
            `${RUNTIME_IMAGES[recipe.runtime.type]}:${tag}`,
        ], { stdio: ['pipe', 'pipe', 'inherit'] });

        return new StdioClient(container, onLog);
    }

    public kill(job: Forge.Job.Schema): Promise<void> {
        return new Promise((resolve, reject) => {
            execFile('docker', ['kill', getContainerName(job)], (error, _stdout, stderr) => {
                if (error)
                    return reject(new Error(`docker kill: ${stderr.trim() || error.message}`));

                resolve();
            });
        });
    }
}
