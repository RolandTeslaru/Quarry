import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import { ForgeAgentOnly } from '@/auth/current-principal';
import { ZodPipe } from '@/http/zod.pipe';
import { ForgeAgentService } from './forge-agent.service';

import Agent = Forge.API.Agent;
const JobRidParam = new ZodPipe(Forge.Job.Rid);

/**
 * ForgeAgents only (`/api/forge-agent/…`, the ForgeAgent token): starting,
 * heartbeating and finishing jobs. Mirrors Forge.API.Agent in @quarry/shared.
 */
@ForgeAgentOnly()
@Controller('forge-agent')
export class ForgeAgentController {

    constructor(private readonly agent: ForgeAgentService) {}

    @Post('jobs/:rid/start')
    @HttpCode(200)
    public async start(
        @Param('rid', JobRidParam) rid: Forge.Job.Rid,
        @Body(new ZodPipe(Agent.Start.Request)) body: Agent.Start.Request,
    ): Promise<Agent.Start.Response> {
        return this.agent.startJob(rid, body.attempt);
    }

    @Post('jobs/:rid/heartbeat')
    @HttpCode(200)
    public async heartbeat(
        @Param('rid', JobRidParam) rid: Forge.Job.Rid,
        @Body(new ZodPipe(Agent.Heartbeat.Request)) body: Agent.Heartbeat.Request,
    ): Promise<Agent.Heartbeat.Response> {
        return this.agent.heartbeatJob(rid, body.attempt);
    }

    @Post('jobs/:rid/finish')
    @HttpCode(200)
    public async finish(
        @Param('rid', JobRidParam) rid: Forge.Job.Rid,
        @Body(new ZodPipe(Agent.Finish.Request)) body: Agent.Finish.Request,
    ): Promise<Agent.Finish.Response> {
        return this.agent.finishJob(rid, body);
    }
}
