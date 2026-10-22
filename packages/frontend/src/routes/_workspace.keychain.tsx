import { createFileRoute } from '@tanstack/react-router'
import { KeychainApp } from '@/apps/keychain/KeychainApp'

export const Route = createFileRoute('/_workspace/keychain')({
    component: KeychainApp,
})
