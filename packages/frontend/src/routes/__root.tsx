import { useEffect } from 'react'
import { createRootRouteWithContext, Link, Outlet, redirect, useRouterState } from '@tanstack/react-router'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import applicationStyles from '@/styles.css?inline'
import { Button } from '@quarry/standard-ui/foundations/button'
import { AuthSDK } from '@/SDKs/AuthSDK/sdk'
import { QuerySDK } from '@/SDKs/QuerySDK/sdk'
import { AppStatus } from '@/components/AppStatus'
import { errorMessage } from '@/SDKs/api'
import { isPublicPath } from '@/routing/public-paths'

interface RouterContext {
    auth: AuthSDK.State
}

export const Route = createRootRouteWithContext<RouterContext>()({
    beforeLoad: ({ context, location }) => {
        if (isPublicPath(location.pathname))
            return

        if (!context.auth.hasSession || context.auth.access !== 'granted')
            throw redirect({ to: '/auth' })
    },

    component: RootLayout,

    errorComponent: ({ error, reset }) => (
        <AppStatus
            title='Could not open this page'
            detail={errorMessage(error)}
            actions={<Button onClick={reset}>Try again</Button>}
        />
    ),

    notFoundComponent: () => (
        <AppStatus
            title='Page not found'
            actions={<Link to='/library'>Back to projects</Link>}
        />
    ),
})

function RootLayout() {
    const pathname = useRouterState({ select: state => state.location.pathname })
    useEffect(() => () => DialogSDK.cleanup(), [pathname])

    const isBlueprintPreview = pathname === '/playground/blueprint' || pathname === '/playground/blueprint/'

    return (
        <>
            {!isBlueprintPreview && <style>{applicationStyles}</style>}
            <QuerySDK.Provider>
                <Outlet />
                <DialogSDK.UIOverlay />
            </QuerySDK.Provider>
        </>
    )
}
