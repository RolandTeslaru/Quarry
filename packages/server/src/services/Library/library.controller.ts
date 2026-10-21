import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Library } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@/auth/current-principal';
import { Principal } from '@/auth/principal';
import { ZodPipe } from '@/http/zod.pipe';
import { LibraryService } from './library.service';

import API = Library.API;
const RidParam = new ZodPipe(Library.Resource.Rid);

/** Mirrors Library.API in @quarry/shared. */
@Controller()
export class LibraryController {

    constructor(private readonly library: LibraryService) {}

    @Get('projects')
    async listProjects(@CurrentPrincipal() principal: Principal.User): Promise<API.Project.List.Response> {
        return { projects: await this.library.listProjects(principal) };
    }

    @Post('projects')
    async createProject(
        @CurrentPrincipal() principal: Principal.User,
        @Body(new ZodPipe(API.Project.Create.Request)) body: API.Project.Create.Request,
    ): Promise<API.Project.Create.Response> {
        return { project: await this.library.createProject(principal, body) };
    }

    @Get('resources/:rid')
    async get(@CurrentPrincipal() principal: Principal.User, @Param('rid', RidParam) rid: Library.Resource.Rid): Promise<API.Resource.Get.Response> {
        return { resource: await this.library.get(principal, rid) };
    }

    @Get('resources/:rid/path')
    async path(@CurrentPrincipal() principal: Principal.User, @Param('rid', RidParam) rid: Library.Resource.Rid): Promise<API.Resource.Path.Response> {
        return { path: await this.library.path(principal, rid) };
    }

    @Get('resources/:rid/children')
    async children(@CurrentPrincipal() principal: Principal.User, @Param('rid', RidParam) rid: Library.Resource.Rid): Promise<API.Resource.Children.Response> {
        return { children: await this.library.children(principal, rid) };
    }

    @Post('resources/:rid/folders')
    async createFolder(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', RidParam) rid: Library.Resource.Rid,
        @Body(new ZodPipe(API.Folder.Create.Request)) body: API.Folder.Create.Request,
    ): Promise<API.Folder.Create.Response> {
        return { folder: await this.library.createFolder(principal, rid, body) };
    }

    @Patch('resources/:rid/name')
    async rename(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', RidParam) rid: Library.Resource.Rid,
        @Body(new ZodPipe(API.Resource.Rename.Request)) body: API.Resource.Rename.Request,
    ): Promise<void> {
        await this.library.rename(principal, rid, body.name);
    }

    @Post('resources/:rid/move')
    async move(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', RidParam) rid: Library.Resource.Rid,
        @Body(new ZodPipe(API.Resource.Move.Request)) body: API.Resource.Move.Request,
    ): Promise<void> {
        await this.library.move(principal, rid, body.parentRid);
    }

    @Post('resources/:rid/trash')
    async trash(@CurrentPrincipal() principal: Principal.User, @Param('rid', RidParam) rid: Library.Resource.Rid): Promise<void> {
        await this.library.trash(principal, rid);
    }
}
