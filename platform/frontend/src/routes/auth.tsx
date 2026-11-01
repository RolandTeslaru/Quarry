import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthenticationPanel } from '@/SDKs/AuthSDK/ui/AuthenticationPanel'

export const Route = createFileRoute('/auth')({
    beforeLoad: ({ context }) => {
        if (context.auth.access === 'granted')
            throw redirect({ to: '/library' })
    },
    component: AuthenticationPanel,
})
