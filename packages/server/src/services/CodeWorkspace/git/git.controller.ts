import { All, BadRequestException, Controller, NotFoundException, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CodeWorkspace } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@/auth/current-principal';
import { Principal } from '@/auth/principal';
import { CodeWorkspaceService } from '../code-workspace.service';
import { serveGit } from './http-backend';

/** The smart-HTTP endpoints; the dumb protocol (raw object files) isn't served. */
const SMART_PATHS = ['info/refs', 'git-upload-pack', 'git-receive-pack'];

/**
 * Git over HTTP for Code Workspaces: `/api/git/<workspace rid>.git`. Sessions
 * clone and push here with the user's token (`http.extraHeader`); Gatekeeper
 * decides — read to fetch, write to push — then `git http-backend` serves it.
 */
@Controller('git')
export class GitController {

    constructor(private readonly service: CodeWorkspaceService) {}

    @All(':repository/*path')
    async serve(
        @CurrentPrincipal() principal: Principal.User,
        @Param('repository') repository: string,
        @Param('path') path: string[],
        @Req() request: Request,
        @Res() response: Response,
    ): Promise<void> {
        const rid = workspaceRid(repository);
        const rest = path.join('/');

        if (!SMART_PATHS.includes(rest))
            throw new NotFoundException('Not found');

        const projectRoot = await this.service.authorizeGit(principal, rid, isPush(request, rest) ? 'push' : 'fetch');

        await serveGit(request, response, {
            projectRoot,
            pathInfo:   `/${rid}.git/${rest}`,
            remoteUser: principal.userRid,
        });
    }
}

/** `ri.code-workspace.main.workspace.….git` → the workspace's RID. */
function workspaceRid(repository: string): CodeWorkspace.Rid {
    const parsed = CodeWorkspace.Rid.safeParse(repository.replace(/\.git$/, ''));

    if (!parsed.success)
        throw new BadRequestException('Not a Code Workspace repository');

    return parsed.data;
}

/** A push: the receive-pack advertisement, or the receive-pack itself. */
function isPush(request: Request, rest: string): boolean {
    return rest === 'git-receive-pack' || request.query.service === 'git-receive-pack';
}
