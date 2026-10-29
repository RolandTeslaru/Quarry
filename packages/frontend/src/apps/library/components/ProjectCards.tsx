import { Button } from '@quarry/standard-ui/foundations/button'
import { Skeleton } from '@quarry/standard-ui/foundations/skeleton'
import { FolderIllustration } from '@quarry/standard-ui/icons'
import type { Library } from '@quarry/shared/domain'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import { cn } from '@quarry/standard-ui/utils/cn'
import { matchesQuery, useLibraryExplorer } from '@/SDKs/LibrarySDK/ui/LibraryExplorer'
import { ErrorNotice } from '@/components/ErrorNotice'

const SKELETON_CARDS = [0, 1, 2, 3]

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4'

interface Props {
    className?: string
}

/** The Library Explorer's first page: every project you can see, as folder tiles, filtered by the navbar's search. */
export function ProjectCards({ className }: Props) {
    const { searchQuery } = useLibraryExplorer()

    const [projects, [projectsRequest]] = LibrarySDK.useWith(
        LibrarySDK.selectors.projects,
        query => [query.projects],
    )

    const matching = projects.filter(project => matchesQuery(project, searchQuery))

    return (
        <div className={cn('flex flex-col gap-6', className)}>
            <ErrorNotice error={projectsRequest.error} />

            {projectsRequest.isPending && (
                <div className={GRID}>
                    {SKELETON_CARDS.map(card => <Skeleton key={card} className='h-40 rounded-xl' />)}
                </div>
            )}

            {projectsRequest.isSuccess && projects.length === 0 && (
                <p className='text-sm text-muted-foreground'>
                    No projects yet. Projects organize your sources, folders, and versioned datasets.
                </p>
            )}

            {projects.length > 0 && matching.length === 0 && (
                <p className='text-sm text-muted-foreground'>No projects match “{searchQuery}”.</p>
            )}

            <div className={GRID}>
                {matching.map(project => <ProjectCard key={project.rid} project={project} />)}
            </div>
        </div>
    )
}

interface ProjectCardProps {
    project: Library.Resource.Base
}

function ProjectCard({ project }: ProjectCardProps) {
    const { setCwd } = useLibraryExplorer()

    return (
        <Button
            variant='minimal'
            data-library-item='project'
            data-library-rid={project.rid}
            className='group h-auto flex-col gap-2 rounded-xl p-3'
            onClick={() => setCwd(project.rid)}
        >
            <FolderIllustration className='size-28 transition-transform group-hover:scale-105' />
            <h2 className='w-full truncate text-sm font-medium'>{project.name}</h2>
        </Button>
    )
}
