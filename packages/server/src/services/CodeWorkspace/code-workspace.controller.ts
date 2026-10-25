import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CodeWorkspace } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@/auth/current-principal';
import { Principal } from '@/auth/principal';
import { ZodPipe } from '@/http/zod.pipe';
import { CodeWorkspaceService } from './code-workspace.service';

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

    @Get(':rid')
    async get(@CurrentPrincipal() principal: Principal.User, @Param('rid', WorkspaceRidParam) rid: CodeWorkspace.Rid): Promise<API.Get.Response> {
        return { workspace: await this.service.get(principal, rid) };
    }
}
