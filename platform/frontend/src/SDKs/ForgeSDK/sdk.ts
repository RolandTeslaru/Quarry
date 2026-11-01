import type { Forge } from '@quarry/shared/domain'
import { createWithEqualityFn } from 'zustand/traditional'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import { BaseSDK } from '../core/BaseSDK'
import { ForgeActions } from './actions'
import { SDK } from '@quarry/standard-ui/SDKs/SDKManager'

@SDK('Forge')
export class ForgeSDKImpl extends BaseSDK<ForgeSDK.State> {

    public readonly useStore: BaseSDK.Store<ForgeSDK.State> = createWithEqualityFn(
        immer<ForgeSDK.State>(() => ({
            builds: [],
        })),
        shallow,
    )

    public readonly actions: ForgeSDK.Actions = new ForgeActions(this)

    public override readonly query = {
        builds: {
            queryKey: ['forge', 'builds'] as const,
            queryFn: () => this.actions.build.list(),
        },
    }

    public override cleanup(): void {
        this.setState({
            builds: [],
        })
    }
}

export const ForgeSDK = SDK.get<ForgeSDKImpl>('Forge')

export namespace ForgeSDK {

    export type State = {
        /** Newest first. */
        builds: Forge.Build.Schema[]
    }

    export type Actions = ForgeActions
}
