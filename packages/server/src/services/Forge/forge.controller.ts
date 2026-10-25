import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@/auth/current-principal';
import { Principal } from '@/auth/principal';
import { ZodPipe } from '@/http/zod.pipe';
import { ForgeService } from './forge.service';

import API = Forge.API;
const BuildRidParam = new ZodPipe(Forge.Build.Rid);
const JobRidParam = new ZodPipe(Forge.Job.Rid);

/** Mirrors Forge.API in @quarry/shared. */
@Controller()
export class ForgeController {

    constructor(private readonly forge: ForgeService) {}

    @Post('builds')
    public async createBuild(
        @CurrentPrincipal() principal: Principal.User,
        @Body(new ZodPipe(API.CreateBuild.Request)) body: API.CreateBuild.Request,
    ): Promise<API.CreateBuild.Response> {
        return this.forge.createBuild(principal, body);
    }

    @Get('builds')
    public async listBuilds(
        @CurrentPrincipal() principal: Principal.User,
        @Query(new ZodPipe(API.ListBuilds.Query)) query: API.ListBuilds.Query,
    ): Promise<API.ListBuilds.Response> {
        return { builds: await this.forge.listBuilds(principal, query) };
    }

    @Get('builds/:rid')
    public async getBuild(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', BuildRidParam) rid: Forge.Build.Rid,
    ): Promise<API.GetBuild.Response> {
        return this.forge.getBuild(principal, rid);
    }

    @Post('builds/:rid/cancel')
    @HttpCode(200)
    public async cancelBuild(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', BuildRidParam) rid: Forge.Build.Rid,
    ): Promise<API.CancelBuild.Response> {
        return this.forge.cancelBuild(principal, rid);
    }

    @Get('jobs/:rid')
    public async getJob(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', JobRidParam) rid: Forge.Job.Rid,
    ): Promise<API.GetJob.Response> {
        return { job: await this.forge.getJob(principal, rid) };
    }

    @Get('job-specs/current')
    public async getCurrentJobSpec(
        @CurrentPrincipal() principal: Principal.User,
        @Query(new ZodPipe(API.GetCurrentJobSpec.Query)) query: API.GetCurrentJobSpec.Query,
    ): Promise<API.GetCurrentJobSpec.Response> {
        return { jobSpec: await this.forge.jobSpecs.getCurrent(principal, query.datasetRid, [query.branch]) };
    }
}
