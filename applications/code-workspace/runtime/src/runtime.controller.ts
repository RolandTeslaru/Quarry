import { promises as fs } from 'node:fs';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import axios from 'axios';
import { CodeWorkspace, Forge, Stdio } from '@quarry/shared/domain';
import { requireEnv } from '@quarry/shared/server/env';
import { System } from '@quarry/shared/server/system';
import { JOB_FILE } from './container';
import { JobFile } from './job-file';
import { OutputUploads } from './output-uploads';
import { GitProcess } from './processes/git-process';
import { Process } from './processes/process';
import { PythonProcess } from './processes/python-process';

/**
 * One transform job: the workspace at the recipe's commit, its locked environment, then the transform —
 * its inputs read through signed URLs, each output file uploaded as Python finishes it. The job's token is
 * the runtime's own: Git and Forge's runtime API take it. Forge commits the files with the job.
 */
@Controller()
export class RuntimeController {

    private readonly log = System.log.withContext('Run');

    @MessagePattern('run')
    public async run(@Payload() request: Forge.Runtime.Run.Request): Promise<Stdio.Payload<Forge.Runtime.Run.Response>> {
        const { job, recipe, token } = request;
        // The agent starts this image for this runtime type only.
        const runtimeConfig = recipe.runtimeConfig as Extract<Forge.Recipe.RuntimeConfig, { type: 'code-workspace' }>;

        this.log.info(`Running ${job.rid} (attempt ${job.attempt})`, {
            transform: runtimeConfig.transform,
            commit:    runtimeConfig.commit,
        });

        const repository = CodeWorkspace.Git.getRepositoryUrl(requireEnv('QUARRY_SERVER_URL'), runtimeConfig.workspaceRid);
        const api = axios.create({
            baseURL: requireEnv('QUARRY_SERVER_URL'),
            headers: { authorization: `Bearer ${token}` },
        });

        try {
            // 1. The code and its environment: the first process that fails ends the job.
            await GitProcess.clone(repository, token);
            await GitProcess.checkout(runtimeConfig.commit);
            await PythonProcess.createVirtualEnvironment();
            await PythonProcess.installLock();

            // 2. What the transform reads and where it writes, in the job file Python is given.
            const { inputs } = await Forge.API.Runtime.getSignedInputUrls(api, job.rid);

            await fs.writeFile(JOB_FILE, JSON.stringify(JobFile.create(job.rid, runtimeConfig, inputs)));

            // 3. The transform, its files uploaded as it announces them.
            const uploads = new OutputUploads(api, job.rid, JobFile.getOutputFolders(runtimeConfig));
            let uploadFailure: string | null = null;

            try {
                await PythonProcess.runTransform((line) => uploads.announce(line));
            }
            finally {
                // Uploads under way settle whatever the transform did; its own failure is reported first.
                uploadFailure = await uploads.finish();
            }

            if (uploadFailure)
                return {
                    status:  'failed',
                    failure: { message: uploadFailure },
                };
        }
        catch (error) {
            if (error instanceof Process.Failure)
                return {
                    status:  'failed',
                    failure: { message: error.message },
                };

            throw error;
        }

        return {
            status:  'succeeded',
            failure: null,
        };
    }
}
