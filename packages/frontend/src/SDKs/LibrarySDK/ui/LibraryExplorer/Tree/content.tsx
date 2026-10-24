import { useEffect, useState, type ReactNode } from 'react'
import { Library } from '@quarry/shared/domain'
import { Skeleton } from '@quarry/standard-ui/foundations/skeleton'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { FolderIllustration, Icon } from '@quarry/standard-ui/icons'
import { cn } from '@quarry/standard-ui/utils/cn'
import { LibrarySDK } from '../../../sdk'
import { App } from '@/AppKit'
import { ErrorNotice } from '@/components/ErrorNotice'
import { resourceIcon } from '@/components/ResourceLink'
import { resourceGlyph } from '@/shell/apps'
import { matchesQuery, useLibraryExplorer } from '../root'
import { IndentGuides } from './indent-guides'

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
        <div role='tree' aria-label='Library' className={cn('flex flex-col py-1', className)}>
            <ErrorNotice error={projectsRequest.error} />

            {projectsRequest.isPending && SKELETON_ROWS.map(row => (
                <Skeleton key={row} className='mx-2 my-1.5 h-4' />
            ))}

            <Branches resources={projects} level={0} ancestorIsLast={[]} openPath={openPath} />
        </div>
    )
}

interface BranchesProps {
    resources:      Library.Resource.Base[]
    level:          number
    ancestorIsLast: boolean[]
    openPath:       Set<Library.Resource.Rid>
}

function Branches({ resources, level, ancestorIsLast, openPath }: BranchesProps) {
    const { treeSearchQuery } = useLibraryExplorer()

    const visible = resources.filter(resource => matchesQuery(resource, treeSearchQuery))

    return (
        <>
            {visible.map((resource, index) => (
                <TreeItem
                    key={resource.rid}
                    resource={resource}
                    level={level}
                    ancestorIsLast={ancestorIsLast}
                    isLastSibling={index === visible.length - 1}
                    openPath={openPath}
                />
            ))}
        </>
    )
}

interface TreeItemProps {
    resource:       Library.Resource.Base
    level:          number
    ancestorIsLast: boolean[]
    isLastSibling:  boolean
    openPath:       Set<Library.Resource.Rid>
}

function TreeItem({ resource, level, ancestorIsLast, isLastSibling, openPath }: TreeItemProps) {
    const isFolder = Library.Resource.CONTAINERS.includes(resource.type)

    if (isFolder) {
        return (
            <FolderItem
                resource={resource}
                level={level}
                ancestorIsLast={ancestorIsLast}
                isLastSibling={isLastSibling}
                openPath={openPath}
            />
        )
    }

    return <LeafItem resource={resource} level={level} ancestorIsLast={ancestorIsLast} isLastSibling={isLastSibling} />
}

function FolderItem({ resource, level, ancestorIsLast, isLastSibling, openPath }: TreeItemProps) {
    const { cwd, setCwd } = useLibraryExplorer()
    const [expanded, setExpanded] = useState(false)
    const [loading, setLoading] = useState(false)

    const onOpenPath = openPath.has(resource.rid)

    const [children, [childrenRequest]] = LibrarySDK.useWith(
        state => LibrarySDK.selectors.children(state, resource.rid),
        query => [{ ...query.children(resource.rid), enabled: expanded }],
    )

    const isEmpty = childrenRequest.isSuccess && children.length === 0

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
        if (loading)
            return

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
        <div role='treeitem' aria-expanded={expanded} aria-selected={cwd === resource.rid}>
            <Row
                level={level}
                ancestorIsLast={ancestorIsLast}
                isLastSibling={isLastSibling}
                elbow
                active={cwd === resource.rid}
                onClick={() => setCwd(resource.rid)}
            >
                <button
                    type='button'
                    aria-label={expanded ? `Collapse ${resource.name}` : `Expand ${resource.name}`}
                    aria-busy={loading}
                    className={cn('grid size-4 shrink-0 cursor-pointer place-items-center text-muted-foreground', isEmpty && 'invisible')}
                    onClick={event => {
                        event.stopPropagation()
                        toggle()
                    }}
                >
                    {loading
                        ? <Spinner className='size-3' />
                        : <Icon name='chevron-right' size={12} className={cn('transition-transform duration-150', expanded && 'rotate-90')} />}
                </button>
                <FolderIllustration color='var(--color-amber-400)' className='mr-1.5 size-4' />
                <span className='min-w-0 flex-1 truncate'>{resource.name}</span>
            </Row>

            {/* Expands and collapses by animating the row from 0fr to 1fr, as PretzelGraph's tree does;
                the children stay mounted while collapsed so closing animates too. */}
            <div
                role='group'
                className={cn(
                    'grid transition-[grid-template-rows,visibility] duration-200 ease-out motion-reduce:transition-none',
                    // Hidden once closed, so its rows can't take focus; visibility flips after the close animation.
                    expanded ? 'visible grid-rows-[1fr]' : 'invisible grid-rows-[0fr]',
                )}
            >
                <div className='min-h-0 overflow-hidden'>
                    <Branches
                        resources={children}
                        level={level + 1}
                        ancestorIsLast={[...ancestorIsLast, isLastSibling]}
                        openPath={openPath}
                    />
                </div>
            </div>
        </div>
    )
}

type LeafItemProps = Omit<TreeItemProps, 'openPath'>

/** A dataset, source or other item: its app's glyph; choosing it calls `onItemClick`. */
function LeafItem({ resource, level, ancestorIsLast, isLastSibling }: LeafItemProps) {
    const { onItemClick, isItemDisabled } = useLibraryExplorer()

    const disabled = isItemDisabled?.(resource) ?? false
    const glyph = resourceGlyph(resource.type)

    return (
        <div role='treeitem' aria-disabled={disabled}>
            <Row
                level={level}
                ancestorIsLast={ancestorIsLast}
                isLastSibling={isLastSibling}
                disabled={disabled}
                onClick={() => onItemClick?.(resource)}
            >
                {glyph
                    ? <App.Glyph glyph={glyph} size={16} bare className='mr-1.5' />
                    : <Icon name={resourceIcon(resource.type)} className='mr-1.5 text-muted-foreground' />}
                <span className='min-w-0 flex-1 truncate'>{resource.name}</span>
            </Row>
        </div>
    )
}

interface RowProps {
    level:          number
    ancestorIsLast: boolean[]
    isLastSibling:  boolean
    elbow?:         boolean
    active?:        boolean
    disabled?:      boolean
    onClick:        () => void
    children:       ReactNode
}

function Row({ level, ancestorIsLast, isLastSibling, elbow, active, disabled, onClick, children }: RowProps) {
    return (
        <div
            className={cn(
                'flex h-7.5 items-center rounded-md px-1 text-sm select-none',
                active ? 'bg-accent font-medium' : 'hover:bg-accent/50',
                disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
            )}
            onClick={disabled ? undefined : onClick}
        >
            <IndentGuides level={level} ancestorIsLast={ancestorIsLast} isLastSibling={isLastSibling} elbow={elbow} />
            {children}
        </div>
    )
}
