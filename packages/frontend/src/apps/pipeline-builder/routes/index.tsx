import { createFileRoute } from '@tanstack/react-router'
import { PipelineBuilderHome } from '@/apps/pipeline-builder/PipelineBuilderHome'

export const Route = createFileRoute('/_workspace/pipeline-builder/')({
    component: PipelineBuilderHome,
})
