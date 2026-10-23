import { createFileRoute } from '@tanstack/react-router'
import { MinimalDemoApp } from '@/apps/minimal-demo/MinimalDemoApp'

export const Route = createFileRoute('/_workspace/minimal-demo/')({
    component: MinimalDemoApp,
})
