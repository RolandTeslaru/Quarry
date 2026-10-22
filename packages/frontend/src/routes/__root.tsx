import { createRootRouteWithContext, Link, Outlet, redirect } from '@tanstack/react-router'
import { Button } from '@blueprintjs/core'
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

    component: () => (
        <QuerySDK.Provider>
            <Outlet />
        </QuerySDK.Provider>
    ),

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
