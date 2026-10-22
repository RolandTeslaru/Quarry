import type { Library } from '@quarry/shared/domain'
import { createWithEqualityFn } from 'zustand/traditional'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import { BaseSDK } from '../core/BaseSDK'
import { _createLibraryActions_, type _LibrarySDKActions } from './actions'
import { _librarySelectors_, type _LibrarySDKSelectors } from './selectors'

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

    public readonly actions: LibrarySDK.Actions = _createLibraryActions_(this)

    public readonly selectors: LibrarySDK.Selectors = _librarySelectors_

    public override readonly query = {
        projects: {
            queryKey: ['library', 'projects'] as const,
            queryFn: () => this.actions.project.list(),
        },

        children: (rid: Library.Resource.Rid) => ({
            queryKey: ['library', 'children', rid] as const,
            queryFn: () => this.actions.resource.children(rid),
        }),

        path: (rid: Library.Resource.Rid) => ({
            queryKey: ['library', 'path', rid] as const,
            queryFn: () => this.actions.resource.path(rid),
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

export const LibrarySDK = new LibrarySDKImpl()

export namespace LibrarySDK {

    export type State = {
        resources: Record<Library.Resource.Rid, Library.Resource.Base>
        projects:  Library.Resource.Rid[]
        children:  Record<Library.Resource.Rid, Library.Resource.Rid[]>
        paths:     Record<Library.Resource.Rid, Library.Resource.Rid[]>
    }

    export type Actions   = _LibrarySDKActions
    export type Selectors = _LibrarySDKSelectors
}
