import { Controller, Get, Query } from '@nestjs/common';
import type { z } from 'zod';
import { Audit } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@quarry/platform-server/auth/current-principal';
import { Principal } from '@quarry/platform-server/auth/principal';
import { ZodPipe } from '@quarry/platform-server/http/zod.pipe';
import { AuditService } from '@quarry/platform-server/services/Audit/audit.service';

import API = Audit.API;

/** Mirrors Audit.API in @quarry/shared. */
@Controller('audit')
export class AuditController {

    constructor(private readonly audit: AuditService) {}

    @Get('recents')
    async recents(
        @CurrentPrincipal() principal: Principal.User,
        @Query(new ZodPipe(API.AccessEvent.Recents.Request)) query: z.output<typeof API.AccessEvent.Recents.Request>,
    ): Promise<API.AccessEvent.Recents.Response> {
        return { recents: await this.audit.recents(principal, query) };
    }

    /** Workspace admins only. */
    @Get('events')
    async list(
        @CurrentPrincipal() principal: Principal.User,
        @Query(new ZodPipe(API.AccessEvent.List.Request)) query: z.output<typeof API.AccessEvent.List.Request>,
    ): Promise<API.AccessEvent.List.Response> {
        return { events: await this.audit.list(principal, query) };
    }
}
