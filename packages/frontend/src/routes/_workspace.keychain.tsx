import { createFileRoute } from '@tanstack/react-router'
import { KeychainPanel } from '@/SDKs/KeychainSDK/ui/KeychainPanel'

export const Route = createFileRoute('/_workspace/keychain')({
    component: KeychainPanel,
})
