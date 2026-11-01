import { Inject } from '@nestjs/common';
import type { z } from 'zod';
import { Foundations } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { MicroserviceCaller } from './microservice-caller';

import MicroserviceCall = Foundations.MicroserviceCall;

/** A service's calls as methods: `client.createDataset(principal, request)`. */
export type MicroserviceClient<C extends MicroserviceCall.Calls> = {
    readonly [K in keyof C]: (principal: Principal, request: z.input<C[K]['Request']>) => Promise<z.output<C[K]['Response']>>;
};

/**
 * A client class for a service's contracts — one method per entry of its `Calls`, nothing written
 * by hand: `class CatalogClient extends createMicroserviceClient(Catalog.Microservice.Calls) {}`, then inject it.
 */
export function createMicroserviceClient<C extends MicroserviceCall.Calls>(calls: C): new (caller: MicroserviceCaller) => MicroserviceClient<C> {
    class Client {
        constructor(@Inject(MicroserviceCaller) caller: MicroserviceCaller) {
            for (const [name, definition] of Object.entries(calls))
                Object.defineProperty(this, name, { value: (principal: Principal, request: unknown) => caller.call(definition, principal, request) });
        }
    }

    return Client as unknown as new (caller: MicroserviceCaller) => MicroserviceClient<C>;
}
