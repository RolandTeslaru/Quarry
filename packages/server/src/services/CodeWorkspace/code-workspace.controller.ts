import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CodeWorkspace } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@/auth/current-principal';
import { Principal } from '@/auth/principal';
import { ZodPipe } from '@/http/zod.pipe';
import { CodeWorkspaceService } from './code-workspace.service';

import CI = CodeWorkspace.CI;
import API = CodeWorkspace.API;
const WorkspaceRidParam = new ZodPipe(CodeWorkspace.Rid);

/** Mirrors CodeWorkspace.API in @quarry/shared. Renaming, moving, trashing and sharing go through Library and Gatekeeper, as for any resource. */
@Controller('code-workspaces')
export class CodeWorkspaceController {

    constructor(private readonly service: CodeWorkspaceService) {}

    @Get('templates')
    getTemplates(): API.ListTemplates.Response {
        return { templates: this.service.getTemplates() };
    }

    @Get()
    async list(@CurrentPrincipal() principal: Principal.User): Promise<API.List.Response> {
        return { workspaces: await this.service.list(principal) };
    }

    @Post()
    async create(
        @CurrentPrincipal() principal: Principal.User,
        @Body(new ZodPipe(API.Create.Request)) body: API.Create.Request,
    ): Promise<API.Create.Response> {
        return { workspace: await this.service.create(principal, body) };
    }

    /** An app opened the workspace's page: the workspace, the open recorded (audit). */
    @Post(':rid/open')
    @HttpCode(200)
    async open(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', WorkspaceRidParam) rid: CodeWorkspace.Rid,
        @Body(new ZodPipe(API.Open.Request)) body: API.Open.Request,
    ): Promise<API.Open.Response> {
        return { workspace: await this.service.open(principal, rid, body.application) };
    }

    /** The caller's session: started or reused; the IDE's URL. */
    @Post(':rid/session')
    @HttpCode(200)
    async openSession(@CurrentPrincipal() principal: Principal.User, @Param('rid', WorkspaceRidParam) rid: CodeWorkspace.Rid): Promise<API.OpenSession.Response> {
        return { url: await this.service.openSession(principal, rid) };
    }

    /** The caller's session: a fresh container from the current runtime image, the working copy kept; the IDE's URL. */
    @Post(':rid/session/restart')
    @HttpCode(200)
    async restartSession(@CurrentPrincipal() principal: Principal.User, @Param('rid', WorkspaceRidParam) rid: CodeWorkspace.Rid): Promise<API.RestartSession.Response> {
        return { url: await this.service.restartSession(principal, rid) };
    }

    @Get(':rid/check-runs')
    async listCheckRuns(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', WorkspaceRidParam) rid: CodeWorkspace.Rid,
        @Query(new ZodPipe(CI.API.ListCheckRuns.Query)) query: CI.API.ListCheckRuns.Query,
    ): Promise<CI.API.ListCheckRuns.Response> {
        return this.service.ci.listCheckRuns(principal, rid, query);
    }

    @Get(':rid/check-runs/:checkRunRid')
    async getCheckRun(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', WorkspaceRidParam) rid: CodeWorkspace.Rid,
        @Param('checkRunRid', new ZodPipe(CI.CheckRun.Rid)) checkRunRid: CI.CheckRun.Rid,
    ): Promise<CI.API.GetCheckRun.Response> {
        return { checkRun: await this.service.ci.getCheckRun(principal, rid, checkRunRid) };
    }

    @Get(':rid')
    async get(@CurrentPrincipal() principal: Principal.User, @Param('rid', WorkspaceRidParam) rid: CodeWorkspace.Rid): Promise<API.Get.Response> {
        return { workspace: await this.service.get(principal, rid) };
    }
}
