import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import { ForgeAgentOnly } from '@/auth/current-principal';
import { ZodPipe } from '@/http/zod.pipe';
import { ForgeAgentService } from './forge-agent.service';

const JobRidParam = new ZodPipe(Forge.Job.Rid);

/**
 * ForgeAgents only (`/api/forge-agent/…`, the ForgeAgent token): claiming,
 * heartbeating and finishing jobs. Mirrors Forge.API.Agent in @quarry/shared.
 */
@ForgeAgentOnly()
@Controller('forge-agent')
export class ForgeAgentController {

    constructor(private readonly agent: ForgeAgentService) {}

    @Post('jobs/:rid/claim')
    @HttpCode(200)
    public async claim(
        @Param('rid', JobRidParam) rid: Forge.Job.Rid,
        @Body(new ZodPipe(Forge.API.Agent.Claim.Request)) body: Forge.API.Agent.Claim.Request,
    ): Promise<Forge.API.Agent.Claim.Response> {
        return this.agent.claimJob(rid, body.attempt);
    }

    @Post('jobs/:rid/heartbeat')
    @HttpCode(200)
    public async heartbeat(
        @Param('rid', JobRidParam) rid: Forge.Job.Rid,
        @Body(new ZodPipe(Forge.API.Agent.Heartbeat.Request)) body: Forge.API.Agent.Heartbeat.Request,
    ): Promise<Forge.API.Agent.Heartbeat.Response> {
        return this.agent.heartbeatJob(rid, body.attempt);
    }

    @Post('jobs/:rid/finish')
    @HttpCode(200)
    public async finish(
        @Param('rid', JobRidParam) rid: Forge.Job.Rid,
        @Body(new ZodPipe(Forge.API.Agent.Finish.Request)) body: Forge.API.Agent.Finish.Request,
    ): Promise<Forge.API.Agent.Finish.Response> {
        return this.agent.finishJob(rid, body);
    }
}
