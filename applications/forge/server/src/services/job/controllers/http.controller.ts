import { Controller, Get, Param } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@quarry/platform-kernel/auth/current-principal';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { ZodPipe } from '@quarry/platform-kernel/http/zod.pipe';
import { JobService } from '../job.service';

import API = Forge.API;
const JobRidParam = new ZodPipe(Forge.Job.Rid);

/** `/api/forge/jobs/…` for users. Mirrors Forge.API in @quarry/shared. */
@Controller('forge')
export class JobController {

    constructor(private readonly jobs: JobService) {}

    @Get('jobs/:rid')
    public async getJob(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', JobRidParam) rid: Forge.Job.Rid,
    ): Promise<API.GetJob.Response> {
        return { job: await this.jobs.getJob(principal, rid) };
    }
}
