import { MessagePattern } from '@nestjs/microservices';
import type { z } from 'zod';
import { Foundations } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import type { MicroserviceCallOptions, MicroserviceCallReceiver } from './microservice-call-receiver';
import { getSubject } from './subjects';

type Definition = Foundations.MicroserviceCall.Definition;

/**
 * Handles a microservice call (docs/design/architecture-split.md §8) — the method gets the principal it acts
 * as and the parsed request, and returns the response:
 *
 *   @MicroserviceCall(Catalog.Microservice.Get, { from: ['data-connection'] })
 *   get(principal: Principal, request: Catalog.Microservice.Get['Request']) { … }
 *
 * The class injects MicroserviceCallReceiver as `microserviceCalls`, which checks the call first. No HTTP route:
 * a microservice call can't be reached through the main server's proxy.
 */
export function MicroserviceCall<D extends Definition>(definition: D, options: MicroserviceCallOptions) {
    return function <M extends (principal: Principal, request: z.output<D['Request']>) => Promise<z.input<D['Response']>>>(
        target:     { microserviceCalls: MicroserviceCallReceiver },
        key:        string | symbol,
        descriptor: TypedPropertyDescriptor<M>,
    ): void {
        const handle = descriptor.value!;

        descriptor.value = async function (this: { microserviceCalls: MicroserviceCallReceiver }, raw: unknown) {
            return this.microserviceCalls.receive(definition, options, raw, (principal, request) => handle.call(this, principal, request as z.output<D['Request']>));
        } as unknown as M;

        MessagePattern(getSubject(definition.PATTERN))(target, key, descriptor);
    };
}
