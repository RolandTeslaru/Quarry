import { createFileRoute } from '@tanstack/react-router'
import { KeychainPanel } from '@/SDKs/KeychainSDK/ui/KeychainPanel'

export const Route = createFileRoute('/_workspace/keychain')({
    component: KeychainRoute,
})

function KeychainRoute() {
    return (
        <div className='max-w-[1560px] px-10 pt-8 pb-15 max-[900px]:p-6'>
            <KeychainPanel />
        </div>
    )
}
