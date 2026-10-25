import { Skeleton } from '@quarry/standard-ui/foundations/skeleton'
import { FolderIllustration, Icon } from '@quarry/standard-ui/icons'
import type { Library } from '@quarry/shared/domain'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import { cn } from '@quarry/standard-ui/utils/cn'
import { matchesQuery, useLibraryExplorer } from '@/SDKs/LibrarySDK/ui/LibraryExplorer'
import { ErrorNotice } from '@/components/ErrorNotice'

const SKELETON_CARDS = [0, 1, 2, 3]

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4'

interface Props {
    className?: string
}

/** The Library Explorer's first page: every project you can see, as cards, filtered by the header's search. */
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
                    {SKELETON_CARDS.map(card => <Skeleton key={card} className='h-44 rounded-xl' />)}
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
        <button
            type='button'
            data-library-item='project'
            data-library-rid={project.rid}
            className='surface group flex cursor-pointer flex-col gap-3 rounded-xl border p-4 text-left shadow-sm transition-shadow hover:shadow-md'
            onClick={() => setCwd(project.rid)}
        >
            <FolderIllustration className='size-12' />

            <div className='min-w-0'>
                <h2 className='truncate font-semibold'>{project.name}</h2>
                <p className='mt-1 line-clamp-2 text-sm text-muted-foreground'>
                    {project.description || 'Sources, datasets, and everything that connects them.'}
                </p>
            </div>

            <div className='mt-auto flex items-center justify-between text-[10px] font-semibold tracking-[1.2px] text-muted-foreground'>
                <span>PROJECT</span>
                <Icon name='arrow-right' className='transition-transform group-hover:translate-x-0.5' />
            </div>
        </button>
    )
}
