import { createFileRoute } from '@tanstack/react-router'
import { ProjectsPanel } from '@/SDKs/LibrarySDK/ui/ProjectsPanel'

export const Route = createFileRoute('/_workspace/library')({
    component: ProjectsPanel,
})
