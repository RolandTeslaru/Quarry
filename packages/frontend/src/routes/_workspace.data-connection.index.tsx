import { createFileRoute } from '@tanstack/react-router'
import { DataConnectionHome } from '@/apps/data-connection/DataConnectionHome'

export const Route = createFileRoute('/_workspace/data-connection/')({
    component: DataConnectionHome,
})
