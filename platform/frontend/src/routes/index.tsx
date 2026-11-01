import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
    beforeLoad: ({ context }) => {
        if (context.auth.access === 'granted')
            throw redirect({ to: '/library' })

        throw redirect({ to: '/auth' })
    },
})
