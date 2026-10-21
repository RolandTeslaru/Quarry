import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Catalog } from '@quarry/shared/domain';
import { Internal } from '@/auth/current-principal';
import { ZodPipe } from '@/http/zod.pipe';
import { CatalogService } from './catalog.service';

import API = Catalog.API;

const Limit = new ZodPipe(z.coerce.number().int().min(1).max(1000).default(100));

/** System-worker-only (`/api/internal/…`, service token). Mirrors Catalog.API.Internal in @quarry/shared. */
@Internal()
@Controller('internal')
export class CatalogInternalController {

    constructor(private readonly catalog: CatalogService) {}

    @Get('outbox')
    async pending(@Query('limit', Limit) limit: number): Promise<API.Internal.PendingEvents.Response> {
        return { events: await this.catalog.pendingEvents(limit) };
    }

    @Post('outbox/published')
    @HttpCode(204)
    published(@Body(new ZodPipe(API.Internal.MarkPublished.Request)) body: API.Internal.MarkPublished.Request): Promise<void> {
        return this.catalog.markPublished(body.ids);
    }

    @Post('storage-gc')
    @HttpCode(200)
    storageGc(@Body(new ZodPipe(API.Internal.StorageGc.Request)) body: API.Internal.StorageGc.Request): Promise<API.Internal.StorageGc.Response> {
        return this.catalog.storageGc(body.staleOpenHours, body.sweepAbortedDays);
    }
}
