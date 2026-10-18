import { Controller, Get } from '@nestjs/common';
import { sql } from 'kysely';
import { Public } from '@/auth/current-principal';
import { db } from '@/db/pool';

@Public()
@Controller('health')
export class HealthController {

    @Get()
    async health() {
        await sql`select 1`.execute(db());

        return { ok: true };
    }
}
