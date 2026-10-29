import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Catalog } from '@quarry/shared/domain';
import { Internal } from '@/auth/current-principal';
import { ZodPipe } from '@/http/zod.pipe';
import { CatalogService } from './catalog.service';

import API = Catalog.API;

/** System-worker-only (`/api/internal/…`, service token). Mirrors Catalog.API.Internal in @quarry/shared. */
@Internal()
@Controller('internal')
export class CatalogInternalController {

    constructor(private readonly catalog: CatalogService) {}

    @Post('storage-gc')
    @HttpCode(200)
    storageGc(@Body(new ZodPipe(API.Internal.StorageGc.Request)) body: API.Internal.StorageGc.Request): Promise<API.Internal.StorageGc.Response> {
        return this.catalog.storageGc(body.staleOpenHours, body.sweepAbortedDays);
    }
}
