import type { Log } from '@quarry/shared/server/system'

// Action groups as classes. An action that can fail handles it itself, as
// PretzelGraph's actions do — logs it, toasts it, rethrows so the caller can
// still react (keep its dialog open):
//
//     async create(request) {
//         try { … }
//         catch (error) {
//             this.log.error('create failed', describeError(error))
//             NotificationSDK.toast.error("Couldn't create source", { description: errorMessage(error) })
//             throw error
//         }
//     }

/**
 * An SDK's group of actions (`actions.source`, `actions.sync`, …). Binds every
 * method to its instance, so an action can be passed as a callback:
 * `withTask(DataConnectionSDK.actions.source.test)`.
 *
 * Each group names its log once, like a server service does:
 *
 *   protected readonly log = log.withContext('DataConnection.Actions.Sync')
 */
export abstract class ActionGroup<SDK> {

    protected abstract readonly log: Log

    constructor(protected readonly sdk: SDK) {
        let prototype: object | null = Object.getPrototypeOf(this)

        while (prototype && prototype !== ActionGroup.prototype) {
            for (const name of Object.getOwnPropertyNames(prototype)) {
                const descriptor = Object.getOwnPropertyDescriptor(prototype, name)

                if (name !== 'constructor' && typeof descriptor?.value === 'function')
                    Object.defineProperty(this, name, { value: descriptor.value.bind(this) })
            }

            prototype = Object.getPrototypeOf(prototype)
        }
    }
}
