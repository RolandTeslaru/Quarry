import { createFileRoute } from '@tanstack/react-router'
import { DatasetsHome } from '@/apps/datasets/DatasetsHome'

export const Route = createFileRoute('/_workspace/datasets/')({
    component: DatasetsHome,
})
