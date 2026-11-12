import type { Identity } from '@quarry/shared/domain'
import { createWithEqualityFn } from 'zustand/traditional'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import { SDK } from '@quarry/standard-ui/SDKs/SDKManager'
import { BaseSDK } from '../core/BaseSDK'
import { IdentityActions } from './actions'

/** The workspace's people, as the frontend shows them — names behind the user RIDs on resources (query cache only). */
@SDK('Identity')
export class IdentitySDKImpl extends BaseSDK<IdentitySDK.State> {

    public readonly useStore: BaseSDK.Store<IdentitySDK.State> = createWithEqualityFn(
        immer<IdentitySDK.State>(() => ({})),
        shallow,
    )

    public readonly actions: IdentitySDK.Actions = new IdentityActions(this)

    public override readonly query = {
        /** Every user in the workspace, by RID. */
        users: {
            queryKey: ['identity', 'users'] as const,
            queryFn: () => this.actions.getUsers(),
            staleTime: 5 * 60_000,
        },
    }

    /** Nothing of its own: users live in the query cache, cleared with it. */
    public override cleanup(): void {}
}

export const IdentitySDK = SDK.get<IdentitySDKImpl>('Identity')

export namespace IdentitySDK {

    export type State = Record<string, never>

    export type Actions = IdentityActions

    export type Users = Record<Identity.User.Rid, Identity.User>
}
