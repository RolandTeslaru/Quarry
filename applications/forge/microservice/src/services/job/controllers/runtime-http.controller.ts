import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Dataset, Forge } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@quarry/platform-kernel/auth/current-principal';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { ZodPipe } from '@quarry/platform-kernel/http/zod.pipe';
import { JobService } from '../job.service';

import API = Forge.API.Runtime;
const JobRidParam = new ZodPipe(Forge.Job.Rid);
const DatasetRidParam = new ZodPipe(Dataset.Rid);

/**
 * `/api/forge/jobs/…` for a running job's runtime, with the job's token: its inputs' signed read URLs,
 * a signed write URL per output file, registering those files. Mirrors Forge.API.Runtime in @quarry/shared.
 */
@Controller('forge')
export class JobRuntimeController {

    constructor(private readonly jobs: JobService) {}

    @Get('jobs/:rid/signed-input-urls')
    public async getSignedInputUrls(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', JobRidParam) rid: Forge.Job.Rid,
    ): Promise<API.GetSignedInputUrls.Response> {
        return this.jobs.getSignedInputUrls(principal, rid);
    }

    @Post('jobs/:rid/outputs/:datasetRid/signed-url')
    public async getSignedOutputUrl(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', JobRidParam) rid: Forge.Job.Rid,
        @Param('datasetRid', DatasetRidParam) datasetRid: Dataset.Rid,
        @Body(new ZodPipe(API.GetSignedOutputUrl.Request)) body: API.GetSignedOutputUrl.Request,
    ): Promise<API.GetSignedOutputUrl.Response> {
        return this.jobs.getSignedOutputUrl(principal, rid, datasetRid, body);
    }

    @Post('jobs/:rid/outputs/:datasetRid/files')
    @HttpCode(204)
    public async registerOutputFile(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', JobRidParam) rid: Forge.Job.Rid,
        @Param('datasetRid', DatasetRidParam) datasetRid: Dataset.Rid,
        @Body(new ZodPipe(API.RegisterOutputFile.Request)) body: API.RegisterOutputFile.Request,
    ): Promise<void> {
        await this.jobs.registerOutputFile(principal, rid, datasetRid, body);
    }
}
