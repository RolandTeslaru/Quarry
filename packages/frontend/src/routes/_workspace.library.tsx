import { createFileRoute } from '@tanstack/react-router'
import { ProjectsPanel } from '@/SDKs/LibrarySDK/ui/ProjectsPanel'

export const Route = createFileRoute('/_workspace/library')({
    component: LibraryRoute,
})

function LibraryRoute() {
    return (
        <div className='max-w-[1560px] px-10 pt-8 pb-15 max-[900px]:p-6'>
            <ProjectsPanel />
        </div>
    )
}
