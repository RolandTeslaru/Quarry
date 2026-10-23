import { Injectable } from '@nestjs/common';
import type { Realtime } from '@quarry/shared/domain';
import { sharedRedis } from '@/infra/redis';

/**
 * Publishes live messages over Redis pub/sub (after PretzelGraph's
 * RealtimeService). Services emit domain events on the channel the event
 * names; the RealtimeGateway relays them to the browsers subscribed to it.
 * Publishing is a plain command, so it uses the process's shared client.
 */
@Injectable()
export class RealtimeService {

    /** Outbound: to whoever is subscribed to the event's own channel. */
    emitEvent<T extends Realtime.Event>(event: T): void {
        void sharedRedis().publish(event.channel, JSON.stringify(event));
    }

    /** Inbound: to a worker listening on the signal's channel. */
    emitSignal<T extends Realtime.Signal>(signal: T): void {
        void sharedRedis().publish(signal.channel, JSON.stringify(signal));
    }
}
