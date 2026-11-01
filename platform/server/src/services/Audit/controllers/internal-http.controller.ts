import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Audit } from '@quarry/shared/domain';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { Internal } from '@quarry/platform-kernel/auth/current-principal';
import { ZodPipe } from '@quarry/platform-kernel/http/zod.pipe';
import { AuditRepository } from '@quarry/platform-kernel/services/Audit/audit.repository';

import API = Audit.API;

/** `/api/internal/audit/…` — the system worker's, with the service token: it consumes audit.record and hands each record here. */
@Internal()
@Controller('internal/audit')
export class AuditInternalController {

    constructor(private readonly repository: AuditRepository) {}

    @Post('records')
    @HttpCode(204)
    public async storeRecord(@Body(new ZodPipe(API.Internal.StoreRecord.Request)) body: API.Internal.StoreRecord.Request): Promise<void> {
        await this.repository.store(Principal.SELF('audit.store'), body.jobId, body.record);
    }
}
