import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { QuerySDK } from './QuerySDK/sdk'
import { LibrarySDK } from './LibrarySDK/sdk'
import { KeychainSDK } from './KeychainSDK/sdk'
import { DataConnectionSDK } from './DataConnectionSDK/sdk'
import { CatalogSDK } from './CatalogSDK/sdk'
import { RealtimeSDK } from './RealtimeSDK/sdk'
import { cancelSessionRequests } from './api'

const sessionSDKs = [
    LibrarySDK,
    KeychainSDK,
    DataConnectionSDK,
    CatalogSDK,
    RealtimeSDK,
]

export function cleanupSDKs(): void {
    cancelSessionRequests()
    QuerySDK.cleanup()
    DialogSDK.cleanup()

    for (const sdk of sessionSDKs)
        sdk.cleanup()
}
