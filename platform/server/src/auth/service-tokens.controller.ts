import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { Foundations } from '@quarry/shared/domain';
import { Internal } from '@quarry/platform-kernel/auth/current-principal';
import { ZodPipe } from '@quarry/platform-kernel/http/zod.pipe';
import { ServiceTokens, type ServiceToken } from '@quarry/platform-kernel/microservice/service-tokens';

const Request = z.object({ service: Foundations.MicroserviceCall.Microservice, secret: z.string().min(1) });

/**
 * `/api/internal/service-tokens` — a service's token, for the service whose secret it is
 * (docs/design/architecture-split.md §8). HTTP, not a microservice call: a service needs its token
 * before it can make one. The main server alone signs them.
 */
@Internal()
@Controller('internal/service-tokens')
export class ServiceTokensController {

    constructor(private readonly tokens: ServiceTokens) {}

    @Post()
    public issue(@Body(new ZodPipe(Request)) body: z.infer<typeof Request>): Promise<ServiceToken> {
        return this.tokens.issue(body.service, body.secret);
    }
}
