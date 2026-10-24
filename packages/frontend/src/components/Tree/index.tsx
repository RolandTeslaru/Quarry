import { createContext, useContext, type ComponentProps, type ReactNode } from 'react'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Icon } from '@quarry/standard-ui/icons'
import { cn } from '@quarry/standard-ui/utils/cn'
import { IndentGuides } from './IndentGuides'

/**
 * A tree: rows with branch lines, branches that open and close animated. Nest
 * items; each knows its depth and branch lines from its parents.
 *
 *   <Tree.Root aria-label='Tables'>
 *       {schemas.map((schema, index) => (
 *           <Tree.Item key={schema.name} isLast={index === schemas.length - 1} expanded={open} onToggle={toggle} label={…}>
 *               {schema.tables.map((table, i) => (
 *                   <Tree.Item key={table.name} isLast={i === schema.tables.length - 1} label={…} onClick={…} />
 *               ))}
 *           </Tree.Item>
 *       ))}
 *   </Tree.Root>
 *
 * An item with `onToggle` is a branch (a chevron, its children under it); one without is a leaf.
 */

interface Level {
    level:          number
    /** For each ancestor level, whether that ancestor is its parent's last child. */
    ancestorIsLast: boolean[]
}

const LevelContext = createContext<Level>({ level: 0, ancestorIsLast: [] })

type Size = 'default' | 'sm'

const SizeContext = createContext<Size>('default')

const ROW_SIZE_CLASSES: Record<Size, string> = {
    default: 'h-7.5 text-sm',
    sm:      'h-6 text-xs',
}

interface RootProps extends ComponentProps<'div'> {
    /** Every row's height and text: `sm` for a dense sidebar. */
    size?: Size
}

function Root({ size = 'default', className, ...props }: RootProps) {
    return (
        <SizeContext.Provider value={size}>
            <div role='tree' className={cn('flex flex-col', className)} {...props} />
        </SizeContext.Provider>
    )
}

interface ItemProps {
    /** The row's content: its icon and name. */
    label:        ReactNode
    /** Whether it's its parent's last child — where the branch line ends. */
    isLast:       boolean
    active?:      boolean
    disabled?:    boolean
    /** Choosing the row. A branch without it toggles instead. */
    onClick?:     () => void
    /** Makes it a branch: the chevron toggles it. */
    onToggle?:    () => void
    expanded?:    boolean
    /** Its children are loading: the chevron spins. */
    loading?:     boolean
    /** A branch known to have no children: no chevron. */
    empty?:       boolean
    /** The chevron's name, e.g. "Expand Sales". */
    toggleLabel?: string
    children?:    ReactNode
}

function Item({ label, isLast, active, disabled, onClick, onToggle, expanded = false, loading = false, empty = false, toggleLabel, children }: ItemProps) {
    const { level, ancestorIsLast } = useContext(LevelContext)
    const size = useContext(SizeContext)

    const isBranch = onToggle !== undefined
    const choose = onClick ?? onToggle

    return (
        <div
            role='treeitem'
            aria-expanded={isBranch ? expanded : undefined}
            aria-selected={active}
            aria-disabled={disabled}
        >
            <div
                className={cn(
                    'flex items-center rounded-md px-1 select-none',
                    ROW_SIZE_CLASSES[size],
                    active ? 'bg-accent font-medium' : 'hover:bg-accent/50',
                    disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
                )}
                onClick={disabled ? undefined : choose}
            >
                <IndentGuides level={level} ancestorIsLast={ancestorIsLast} isLastSibling={isLast} elbow={isBranch} />

                {isBranch && (
                    <button
                        type='button'
                        aria-label={toggleLabel}
                        aria-busy={loading}
                        className={cn('grid size-4 shrink-0 cursor-pointer place-items-center text-muted-foreground', empty && 'invisible')}
                        onClick={event => {
                            event.stopPropagation()

                            if (!loading)
                                onToggle()
                        }}
                    >
                        {loading
                            ? <Spinner className='size-3' />
                            : <Icon name='chevron-right' size={12} className={cn('transition-transform duration-150', expanded && 'rotate-90')} />}
                    </button>
                )}

                {label}
            </div>

            {/* Opens and closes by animating the row from 0fr to 1fr, as PretzelGraph's tree does;
                the children stay mounted while closed so closing animates too. */}
            {isBranch && (
                <div
                    role='group'
                    className={cn(
                        'grid transition-[grid-template-rows,visibility] duration-200 ease-out motion-reduce:transition-none',
                        // Hidden once closed, so its rows can't take focus; visibility flips after the close animation.
                        expanded ? 'visible grid-rows-[1fr]' : 'invisible grid-rows-[0fr]',
                    )}
                >
                    <div className='min-h-0 overflow-hidden'>
                        <LevelContext.Provider value={{ level: level + 1, ancestorIsLast: [...ancestorIsLast, isLast] }}>
                            {children}
                        </LevelContext.Provider>
                    </div>
                </div>
            )}
        </div>
    )
}

export const Tree = {
    Root,
    Item,
}
