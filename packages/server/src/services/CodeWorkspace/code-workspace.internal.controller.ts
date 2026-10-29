import { Body, Controller, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CodeWorkspace } from '@quarry/shared/domain';
import { Internal } from '@/auth/current-principal';
import { Principal } from '@/auth/principal';
import { ZodPipe } from '@/http/zod.pipe';
import { CodeWorkspaceService } from './code-workspace.service';

import CI = CodeWorkspace.CI;
import API = CodeWorkspace.API;

const CheckRunRidParam = new ZodPipe(CI.CheckRun.Rid);

/**
 * Internal (`/api/internal/…`, service token): the code workspace worker's — session
 * credentials, running check runs — and the system worker's check sweep. Mirrors
 * CodeWorkspace.API.Internal in @quarry/shared.
 */
@Internal()
@Controller('internal')
export class CodeWorkspaceInternalController {

    constructor(private readonly service: CodeWorkspaceService) {}

    @Post('code-workspaces/session-credentials')
    @HttpCode(200)
    getSessionCredentials(
        @Body(new ZodPipe(API.Internal.SessionCredentials.Request)) body: API.Internal.SessionCredentials.Request,
    ): Promise<API.Internal.SessionCredentials.Response> {
        // As the user, through their session on this workspace — what audit records as `via`.
        const principal = Principal.delegate(body.userRid, `code-workspace-session:${body.workspaceRid}`);

        return this.service.getSessionCredentials(principal, body.workspaceRid);
    }

    @Post('code-workspaces/check-runs/sweep')
    @HttpCode(200)
    public sweepCheckRuns(): Promise<CI.API.Internal.CheckRun.Sweep.Response> {
        return this.service.ci.sweep();
    }

    @Post('code-workspaces/check-runs/:rid/start')
    @HttpCode(200)
    public startCheckRun(@Param('rid', CheckRunRidParam) rid: CI.CheckRun.Rid): Promise<CI.API.Internal.CheckRun.Start.Response> {
        return this.service.ci.start(rid);
    }

    @Post('code-workspaces/check-runs/:rid/steps/:index')
    @HttpCode(200)
    public async reportCheckStep(
        @Param('rid', CheckRunRidParam) rid: CI.CheckRun.Rid,
        @Param('index', ParseIntPipe) index: number,
        @Body(new ZodPipe(CI.API.Internal.CheckRun.Step.Request)) body: CI.API.Internal.CheckRun.Step.Request,
    ): Promise<CI.API.Internal.CheckRun.Response> {
        return { checkRun: await this.service.ci.reportStep(rid, index, body) };
    }

    @Post('code-workspaces/check-runs/:rid/finish')
    @HttpCode(200)
    public async finishCheckRun(
        @Param('rid', CheckRunRidParam) rid: CI.CheckRun.Rid,
        @Body(new ZodPipe(CI.API.Internal.CheckRun.Finish.Request)) body: CI.API.Internal.CheckRun.Finish.Request,
    ): Promise<CI.API.Internal.CheckRun.Response> {
        return { checkRun: await this.service.ci.finish(rid, body) };
    }
}
