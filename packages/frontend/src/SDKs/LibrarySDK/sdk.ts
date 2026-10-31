import type { Library } from '@quarry/shared/domain'
import { createWithEqualityFn } from 'zustand/traditional'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import { BaseSDK } from '../core/BaseSDK'
import { LibraryActions } from './actions'
import { _createLibraryDialogs_, type _LibrarySDKDialogs } from './dialogs'
import { _librarySelectors_, type _LibrarySDKSelectors } from './selectors'
import { SDK } from '@quarry/standard-ui/SDKs/SDKManager'

@SDK('Library')
export class LibrarySDKImpl extends BaseSDK<LibrarySDK.State> {

    public readonly useStore: BaseSDK.Store<LibrarySDK.State> = createWithEqualityFn(
        immer<LibrarySDK.State>(() => ({
            resources: {},
            projects: [],
            children: {},
            paths: {},
        })),
        shallow,
    )

    public readonly actions: LibrarySDK.Actions = new LibraryActions(this)

    public readonly dialogs: LibrarySDK.Dialogs = _createLibraryDialogs_()

    public readonly selectors: LibrarySDK.Selectors = _librarySelectors_

    public override readonly query = {
        projects: {
            queryKey: ['library', 'projects'] as const,
            queryFn: () => this.actions.project.list(),
        },

        children: (rid: Library.Resource.Rid) => ({
            queryKey: ['library', 'children', rid] as const,
            queryFn: () => this.actions.resource.getChildren(rid),
        }),

        path: (rid: Library.Resource.Rid) => ({
            queryKey: ['library', 'path', rid] as const,
            queryFn: () => this.actions.resource.getPath(rid),
        }),
    }

    public override cleanup(): void {
        this.setState({
            resources: {},
            projects: [],
            children: {},
            paths: {},
        })
    }
}

export const LibrarySDK = SDK.get<LibrarySDKImpl>('Library')

export namespace LibrarySDK {

    export type State = {
        resources: Record<Library.Resource.Rid, Library.Resource.Base>
        projects:  Library.Resource.Rid[]
        children:  Record<Library.Resource.Rid, Library.Resource.Rid[]>
        paths:     Record<Library.Resource.Rid, Library.Resource.Rid[]>
    }

    export type Actions   = LibraryActions
    export type Dialogs = _LibrarySDKDialogs
    export type Selectors = _LibrarySDKSelectors
}
