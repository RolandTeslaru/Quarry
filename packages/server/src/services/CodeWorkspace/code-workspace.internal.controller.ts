import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CodeWorkspace } from '@quarry/shared/domain';
import { Internal } from '@/auth/current-principal';
import { ZodPipe } from '@/http/zod.pipe';
import { CodeWorkspaceService } from './code-workspace.service';

import API = CodeWorkspace.API;

/** Code-workspace-worker-only (`/api/internal/…`, service token). Mirrors CodeWorkspace.API.Internal in @quarry/shared. */
@Internal()
@Controller('internal')
export class CodeWorkspaceInternalController {

    constructor(private readonly service: CodeWorkspaceService) {}

    @Post('code-workspaces/session-credentials')
    @HttpCode(200)
    getSessionCredentials(
        @Body(new ZodPipe(API.Internal.SessionCredentials.Request)) body: API.Internal.SessionCredentials.Request,
    ): Promise<API.Internal.SessionCredentials.Response> {
        return this.service.getSessionCredentials(body);
    }
}
