import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CodeWorkspace } from '@quarry/shared/domain';
import { SessionManager } from '../session-manager';
import { ServiceTokenGuard } from './service-token.guard';

import Worker = CodeWorkspace.API.Worker;

/**
 * Session requests from the server, made after its permission checks: open a
 * session. Mirrors CodeWorkspace.API.Worker in @quarry/shared.
 */
@UseGuards(ServiceTokenGuard)
@Controller('sessions')
export class SessionController {

    constructor(private readonly sessionManager: SessionManager) {}

    @Post('open')
    @HttpCode(200)
    public async openSession(@Body() body: unknown): Promise<Worker.OpenSession.Response> {
        const request = Worker.OpenSession.Request.parse(body);

        return { url: await this.sessionManager.open(request.workspaceRid, request.userRid) };
    }
}
