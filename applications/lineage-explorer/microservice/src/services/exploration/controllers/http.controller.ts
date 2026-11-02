import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { LineageExplorer } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@quarry/platform-kernel/auth/current-principal';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { ZodPipe } from '@quarry/platform-kernel/http/zod.pipe';
import { ExplorationService } from '../exploration.service';

import API = LineageExplorer.API;
const ExplorationRidParam = new ZodPipe(LineageExplorer.Exploration.Rid);

/** Mirrors LineageExplorer.API.Exploration in @quarry/shared. */
@Controller('lineage-explorer/explorations')
export class ExplorationController {

    constructor(private readonly explorations: ExplorationService) {}

    @Post()
    async create(
        @CurrentPrincipal() principal: Principal.User,
        @Body(new ZodPipe(API.Exploration.Create.Request)) body: API.Exploration.Create.Request,
    ): Promise<API.Exploration.Create.Response> {
        return { exploration: await this.explorations.create(principal, body) };
    }

    @Get()
    async list(@CurrentPrincipal() principal: Principal.User): Promise<API.Exploration.List.Response> {
        return { explorations: await this.explorations.list(principal) };
    }

    /** An app opened the exploration: it, its graph read now, the open recorded (audit). */
    @Post(':rid/open')
    @HttpCode(200)
    open(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', ExplorationRidParam) rid: LineageExplorer.Exploration.Rid,
        @Body(new ZodPipe(API.Exploration.Open.Request)) body: API.Exploration.Open.Request,
    ): Promise<API.Exploration.Open.Response> {
        return this.explorations.open(principal, rid, body.application);
    }

    @Put(':rid/nodes')
    async save(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', ExplorationRidParam) rid: LineageExplorer.Exploration.Rid,
        @Body(new ZodPipe(API.Exploration.Save.Request)) body: API.Exploration.Save.Request,
    ): Promise<API.Exploration.Save.Response> {
        return { exploration: await this.explorations.save(principal, rid, body.nodes) };
    }
}
