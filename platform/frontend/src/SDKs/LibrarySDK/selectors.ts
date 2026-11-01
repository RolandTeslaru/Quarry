import type { Library } from '@quarry/shared/domain'
import type { LibrarySDK } from './sdk'

export const _librarySelectors_ = {
    projects: (state: LibrarySDK.State): Library.Resource.Base[] =>
        state.projects.map(rid => state.resources[rid]),

    children: (state: LibrarySDK.State, rid: Library.Resource.Rid): Library.Resource.Base[] =>
        (state.children[rid] ?? []).map(childRid => state.resources[childRid]),

    folders: (state: LibrarySDK.State, rid: Library.Resource.Rid): Library.Resource.Base[] =>
        _librarySelectors_.children(state, rid).filter(resource => resource.type === 'folder'),

    path: (state: LibrarySDK.State, rid: Library.Resource.Rid): Library.Resource.Base[] =>
        (state.paths[rid] ?? []).map(ancestorRid => state.resources[ancestorRid]),
}

export type _LibrarySDKSelectors = typeof _librarySelectors_
