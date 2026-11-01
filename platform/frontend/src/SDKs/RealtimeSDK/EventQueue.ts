import type { Realtime } from '@quarry/shared/domain'

// From PretzelGraph's Realtime/EventQueue.

/**
 * Applies a channel's events strictly in arrival order, even when handling one
 * has to wait on something (a request). Each event chains off the previous
 * one's promise; a synchronous handler works the same way.
 */
export class AsyncEventQueueHandler<T extends Realtime.Event = Realtime.Event> {

    // The promise for the most recently added event.
    private tail = Promise.resolve()

    // Bumped by clear(): events queued under an older generation are skipped.
    private generation = 0

    constructor(private readonly handler: (event: T) => void | Promise<void>) {}

    public add(event: T): void {
        const generation = this.generation

        this.tail = this.tail
            .then(() => {
                if (generation === this.generation)
                    return this.handler(event)
            })
            .catch(error => {
                console.error('[Realtime] An event handler failed', error)
            })
    }

    /** Drops whatever is still pending; what is already running finishes. */
    public clear(): void {
        this.generation++
    }
}
