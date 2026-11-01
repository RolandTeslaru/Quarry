import { Controller, Get } from '@nestjs/common';

/** For container probes: the agent is up. */
@Controller('health')
export class HealthController {

    @Get()
    public health() {
        return { ok: true, agent: 'forge' };
    }
}
