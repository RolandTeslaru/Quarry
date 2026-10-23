import type { Platform } from '@quarry/shared/domain'
import { createWithEqualityFn } from 'zustand/traditional'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import { SDK } from '@quarry/standard-ui/SDKs/SDKManager'
import { BaseSDK } from '../core/BaseSDK'
import { AuditActions } from './actions'

/**
 * Audit, as the frontend sees it: each app's recents (query cache only —
 * they're per user, per app). Every event is recorded by the server — opens by
 * each resource's open request. See docs/design/audit.md.
 */
@SDK('Audit')
export class AuditSDKImpl extends BaseSDK<AuditSDK.State> {

    public readonly useStore: BaseSDK.Store<AuditSDK.State> = createWithEqualityFn(
        immer<AuditSDK.State>(() => ({})),
        shallow,
    )

    public readonly actions: AuditSDK.Actions = new AuditActions(this)

    public override readonly query = {
        /** The user's latest opens in one app, newest first. */
        recents: (application: Platform.Application.Id) => ({
            queryKey: ['audit', 'recents', application] as const,
            queryFn: () => this.actions.recents(application),
        }),
    }

    /** Nothing of its own: recents live in the query cache, cleared with it. */
    public override cleanup(): void {}
}

export const AuditSDK = SDK.get<AuditSDKImpl>('Audit')

export namespace AuditSDK {

    export type State = Record<string, never>

    export type Actions = AuditActions
}
