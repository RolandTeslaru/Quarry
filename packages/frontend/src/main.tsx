import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { Button } from '@quarry/standard-ui/foundations/button'
import { AuthSDK } from '@/SDKs/AuthSDK/sdk'
import { AppStatus } from '@/components/AppStatus'
import { routeTree } from './routeTree.gen'
import { isPlaygroundPath } from '@/routing/public-paths'

export const router = createRouter({
    routeTree,
    context: {
        auth: AuthSDK.state,
    },
    defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router
    }
}

AuthSDK.init()

function App() {
    const auth = AuthSDK.useStore(state => state)

    useEffect(() => {
        if (auth.hasSession === null || auth.access === 'checking' || auth.access === 'unreachable')
            return

        void router.invalidate()
    }, [auth.hasSession, auth.access])

    if (isPlaygroundPath(window.location.pathname))
        return <RouterProvider router={router} context={{ auth }} />

    if (auth.hasSession === null) {
        return (
            <AppStatus
                title='Checking your session'
                loading
            />
        )
    }

    if (auth.hasSession && auth.access === 'checking') {
        return (
            <AppStatus
                title='Connecting to your workspace'
                loading
            />
        )
    }

    if (auth.hasSession && auth.access === 'unreachable') {
        return (
            <AppStatus
                title='Your workspace is not responding'
                detail={auth.error ?? 'Check that the Quarry API is running.'}
                actions={(
                    <Button onClick={() => void AuthSDK.actions.syncUser()}>
                        Try again
                    </Button>
                )}
            />
        )
    }

    return <RouterProvider router={router} context={{ auth }} />
}

const rootElement = document.getElementById('root')

if (!rootElement)
    throw new Error('Missing application root')

if (!rootElement.innerHTML) {
    createRoot(rootElement).render(
        <StrictMode>
            <App />
        </StrictMode>,
    )
}
