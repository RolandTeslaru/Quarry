import type { DataConnectionSDKImpl } from '../sdk'
import { createSourceActions, type SourceActions } from './source'
import { createSyncActions, type SyncActions } from './sync'
import { createRunActions, type RunActions } from './run'

export type _DataConnectionSDKActions = {
    source: SourceActions
    sync:   SyncActions
    run:    RunActions
}

export function _createDataConnectionActions_(sdk: DataConnectionSDKImpl): _DataConnectionSDKActions {
    return {
        source: createSourceActions(sdk),
        sync: createSyncActions(sdk),
        run: createRunActions(sdk),
    }
}
