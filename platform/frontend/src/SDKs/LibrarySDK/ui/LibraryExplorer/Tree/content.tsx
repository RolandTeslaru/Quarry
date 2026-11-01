import { useEffect, useState } from 'react'
import { Library } from '@quarry/shared/domain'
import { Skeleton } from '@quarry/standard-ui/foundations/skeleton'
import { FolderFlatIllustration } from '@quarry/standard-ui/icons'
import { cn } from '@quarry/standard-ui/utils/cn'
import { LibrarySDK } from '../../../sdk'
import { ErrorNotice } from '@/components/ErrorNotice'
import { ResourceIcon } from '@/components/ResourceIcon'
import { Tree } from '@/components/Tree'
import { matchesQuery, useLibraryExplorer } from '../root'

const SKELETON_ROWS = [0, 1, 2, 3, 4]

interface Props {
    className?: string
}

/**
 * The project tree: every item, with branch lines. A folder never expands
 * before its children are there: the first time, its chevron spins while they
 * load (the Library serves one folder at a time), then it opens — so the open
 * animation always has its rows. The open folder's ancestors expand the same
 * way. The tree search filters loaded rows.
 */
export function Content({ className }: Props) {
    const { cwd } = useLibraryExplorer()

    const [projects, [projectsRequest]] = LibrarySDK.useWith(
        LibrarySDK.selectors.projects,
        query => [query.projects],
    )

    const [path] = LibrarySDK.useWith(
        state => (cwd ? LibrarySDK.selectors.path(state, cwd) : []),
        query => (cwd ? [query.path(cwd)] : []),
    )

    const openPath = new Set(path.map(resource => resource.rid))

    return (
        <Tree.Root aria-label='Library' className={cn('py-1', className)}>
            <ErrorNotice error={projectsRequest.error} />

            {projectsRequest.isPending && SKELETON_ROWS.map(row => (
                <Skeleton key={row} className='mx-2 my-1.5 h-4' />
            ))}

            <Branches resources={projects} openPath={openPath} />
        </Tree.Root>
    )
}

interface BranchesProps {
    resources: Library.Resource.Base[]
    openPath:  Set<Library.Resource.Rid>
}

function Branches({ resources, openPath }: BranchesProps) {
    const { treeSearchQuery } = useLibraryExplorer()

    const visible = resources.filter(resource => matchesQuery(resource, treeSearchQuery))

    return (
        <>
            {visible.map((resource, index) => (
                <TreeItem
                    key={resource.rid}
                    resource={resource}
                    isLast={index === visible.length - 1}
                    openPath={openPath}
                />
            ))}
        </>
    )
}

interface TreeItemProps {
    resource: Library.Resource.Base
    isLast:   boolean
    openPath: Set<Library.Resource.Rid>
}

function TreeItem({ resource, isLast, openPath }: TreeItemProps) {
    const isFolder = Library.Resource.CONTAINERS.includes(resource.type)

    if (isFolder)
        return <FolderItem resource={resource} isLast={isLast} openPath={openPath} />

    return <LeafItem resource={resource} isLast={isLast} />
}

function FolderItem({ resource, isLast, openPath }: TreeItemProps) {
    const { cwd, setCwd } = useLibraryExplorer()
    const [expanded, setExpanded] = useState(false)
    const [loading, setLoading] = useState(false)

    const onOpenPath = openPath.has(resource.rid)

    const [children, [childrenRequest]] = LibrarySDK.useWith(
        state => LibrarySDK.selectors.children(state, resource.rid),
        query => [{ ...query.children(resource.rid), enabled: expanded }],
    )

    // Opens only once the children are there: loaded already, or after a fetch with the chevron spinning.
    async function expand() {
        if (!childrenRequest.isSuccess) {
            setLoading(true)

            try {
                await LibrarySDK.fetch(LibrarySDK.query.children(resource.rid))
            }
            catch {
                return                                              // stays closed; the next click tries again
            }
            finally {
                setLoading(false)
            }
        }

        setExpanded(true)
    }

    function toggle() {
        if (expanded)
            setExpanded(false)
        else
            void expand()
    }

    // A folder opened elsewhere (the view, a link) expands its ancestors here — the same way.
    useEffect(() => {
        if (onOpenPath && !expanded)
            void expand()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onOpenPath])

    return (
        <Tree.Item
            isLast={isLast}
            active={cwd === resource.rid}
            onClick={() => setCwd(resource.rid)}
            onToggle={toggle}
            expanded={expanded}
            loading={loading}
            empty={childrenRequest.isSuccess && children.length === 0}
            toggleLabel={expanded ? `Collapse ${resource.name}` : `Expand ${resource.name}`}
            label={(
                <>
                    <FolderFlatIllustration className='mr-1.5 size-4' />
                    <span className='min-w-0 flex-1 truncate'>{resource.name}</span>
                </>
            )}
        >
            <Branches resources={children} openPath={openPath} />
        </Tree.Item>
    )
}

/** A dataset, source or other item: its app's glyph; choosing it calls `onItemClick`. */
function LeafItem({ resource, isLast }: Omit<TreeItemProps, 'openPath'>) {
    const { onItemClick, isItemDisabled } = useLibraryExplorer()

    return (
        <Tree.Item
            isLast={isLast}
            disabled={isItemDisabled?.(resource) ?? false}
            onClick={() => onItemClick?.(resource)}
            label={(
                <>
                    <ResourceIcon type={resource.type} className='mr-1.5' />
                    <span className='min-w-0 flex-1 truncate'>{resource.name}</span>
                </>
            )}
        />
    )
}
