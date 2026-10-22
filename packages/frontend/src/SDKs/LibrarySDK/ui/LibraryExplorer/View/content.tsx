import { Library } from '@quarry/shared/domain'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Skeleton } from '@quarry/standard-ui/foundations/skeleton'
import { cn } from '@quarry/standard-ui/utils/cn'
import { LibrarySDK } from '../../../sdk'
import { ErrorNotice } from '@/components/ErrorNotice'
import { matchesQuery, useLibraryExplorer } from '../root'
import { ItemCard } from './items'

// Sections in this order; anything else the server lists comes after.
const TYPE_ORDER: Library.Resource.Type[] = ['project', 'folder', 'dataset', 'source']

const TYPE_LABELS: Record<Library.Resource.Type, string> = {
    project:    'Project',
    folder:     'Folder',
    dataset:    'Dataset',
    source:     'Source',
    credential: 'Credential',
}

const SKELETON_CARDS = [0, 1, 2, 3, 4, 5, 6, 7]

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2'

interface Props {
    className?: string
}

/** The open folder's contents — or the workspace's projects — as cards, grouped by type. */
export function Content({ className }: Props) {
    const { cwd } = useLibraryExplorer()

    if (cwd === null)
        return <ProjectsContent className={className} />

    return <FolderContent rid={cwd} className={className} />
}

function ProjectsContent({ className }: Props) {
    const [projects, [projectsRequest]] = LibrarySDK.useWith(
        LibrarySDK.selectors.projects,
        query => [query.projects],
    )

    return (
        <Items
            resources={projects}
            pending={projectsRequest.isPending}
            error={projectsRequest.error}
            onRetry={() => void projectsRequest.refetch()}
            emptyText='No projects yet.'
            className={className}
        />
    )
}

interface FolderContentProps extends Props {
    rid: Library.Resource.Rid
}

function FolderContent({ rid, className }: FolderContentProps) {
    const [children, [childrenRequest]] = LibrarySDK.useWith(
        state => LibrarySDK.selectors.children(state, rid),
        query => [query.children(rid)],
    )

    return (
        <Items
            resources={children}
            pending={childrenRequest.isPending}
            error={childrenRequest.error}
            onRetry={() => void childrenRequest.refetch()}
            emptyText='This folder is empty.'
            className={className}
        />
    )
}

interface ItemsProps extends Props {
    resources: Library.Resource.Base[]
    pending:   boolean
    error:     Error | null
    onRetry:   () => void
    emptyText: string
}

function Items({ resources, pending, error, onRetry, emptyText, className }: ItemsProps) {
    const { setCwd, onItemClick, isItemDisabled, searchQuery } = useLibraryExplorer()

    function open(resource: Library.Resource.Base) {
        if (Library.Resource.CONTAINERS.includes(resource.type)) {
            setCwd(resource.rid)

            return
        }

        onItemClick?.(resource)
    }

    if (pending && resources.length === 0)
        return <ContentSkeleton className={className} />

    if (error) {
        return (
            <div className={className}>
                <ErrorNotice error={error} />
                <Button onClick={onRetry}>Try again</Button>
            </div>
        )
    }

    const matching = resources.filter(resource => matchesQuery(resource, searchQuery))

    if (resources.length === 0)
        return <p className={cn('text-sm text-muted-foreground', className)}>{emptyText}</p>

    if (matching.length === 0)
        return <p className={cn('text-sm text-muted-foreground', className)}>Nothing matches “{searchQuery}”.</p>

    return (
        <div className={cn('flex flex-col gap-5', className)}>
            {groupByType(matching).map(([type, group]) => (
                <section key={type} className='flex flex-col gap-2'>
                    <h3 className='text-xs font-medium text-muted-foreground'>
                        {group.length} {TYPE_LABELS[type]}{group.length === 1 ? '' : 's'}
                    </h3>

                    <div className={GRID}>
                        {group.map(resource => (
                            <ItemCard
                                key={resource.rid}
                                resource={resource}
                                disabled={isItemDisabled?.(resource) ?? false}
                                onOpen={() => open(resource)}
                            />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    )
}

/** Placeholder cards while a folder loads. Exported as `LibraryExplorer.View.Skeleton`. */
export function ContentSkeleton({ className }: Props) {
    return (
        <div className={cn('flex flex-col gap-2', className)}>
            <Skeleton className='h-3 w-20' />

            <div className={GRID}>
                {SKELETON_CARDS.map(card => (
                    <div key={card} className='flex flex-col items-center gap-1.5 p-2'>
                        <Skeleton className='size-16 rounded-lg' />
                        <Skeleton className='h-3.5 w-20' />
                        <Skeleton className='h-3 w-12' />
                    </div>
                ))}
            </div>
        </div>
    )
}

function groupByType(resources: Library.Resource.Base[]): [Library.Resource.Type, Library.Resource.Base[]][] {
    const groups = new Map<Library.Resource.Type, Library.Resource.Base[]>()

    for (const resource of resources)
        groups.set(resource.type, [...(groups.get(resource.type) ?? []), resource])

    return [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b))
}

function rank(type: Library.Resource.Type): number {
    const index = TYPE_ORDER.indexOf(type)

    return index === -1 ? TYPE_ORDER.length : index
}
