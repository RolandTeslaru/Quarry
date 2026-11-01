import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import { ForgeAgentOnly } from '@quarry/platform-kernel/auth/current-principal';
import { ZodPipe } from '@quarry/platform-kernel/http/zod.pipe';
import { ForgeService } from '../forge.service';
import { JobService } from '../../job/job.service';

const JobRidParam = new ZodPipe(Forge.Job.Rid);

/**
 * ForgeAgents only (`/api/forge-agent/…`, the ForgeAgent token): claiming,
 * heartbeating and finishing jobs. Mirrors Forge.API.Agent in @quarry/shared.
 */
@ForgeAgentOnly()
@Controller('forge-agent')
export class ForgeAgentController {

    constructor(
        private readonly jobs:  JobService,
        private readonly forge: ForgeService,
    ) {}

    @Post('jobs/:rid/claim')
    @HttpCode(200)
    public async claim(
        @Param('rid', JobRidParam) rid: Forge.Job.Rid,
        @Body(new ZodPipe(Forge.API.Agent.Claim.Request)) body: Forge.API.Agent.Claim.Request,
    ): Promise<Forge.API.Agent.Claim.Response> {
        return this.forge.claimJob(rid, body.attempt);
    }

    @Post('jobs/:rid/heartbeat')
    @HttpCode(200)
    public async heartbeat(
        @Param('rid', JobRidParam) rid: Forge.Job.Rid,
        @Body(new ZodPipe(Forge.API.Agent.Heartbeat.Request)) body: Forge.API.Agent.Heartbeat.Request,
    ): Promise<Forge.API.Agent.Heartbeat.Response> {
        return this.jobs.heartbeatJob(rid, body.attempt);
    }

    @Post('jobs/:rid/finish')
    @HttpCode(200)
    public async finish(
        @Param('rid', JobRidParam) rid: Forge.Job.Rid,
        @Body(new ZodPipe(Forge.API.Agent.Finish.Request)) body: Forge.API.Agent.Finish.Request,
    ): Promise<Forge.API.Agent.Finish.Response> {
        return this.forge.finishJob(rid, body);
    }
}
