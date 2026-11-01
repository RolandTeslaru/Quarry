import { openCreateCredentialDialog } from './credential-dialogs'
import { openEditCredentialValuesDialog } from './credential-values-dialog'

export function _createKeychainDialogs_() {
    return {
        openCreateCredential:     openCreateCredentialDialog,
        openEditCredentialValues: openEditCredentialValuesDialog,
    }
}

export type _KeychainSDKDialogs = ReturnType<typeof _createKeychainDialogs_>
