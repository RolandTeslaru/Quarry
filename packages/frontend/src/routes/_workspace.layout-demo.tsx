import { createFileRoute } from '@tanstack/react-router'
import { LayoutDemoApp } from '@/apps/layout-demo/LayoutDemoApp'

export const Route = createFileRoute('/_workspace/layout-demo')({
    component: LayoutDemoApp,
})
