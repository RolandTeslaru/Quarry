import { cn } from '@quarry/standard-ui/utils/cn'

// From PretzelGraph's components/Tree/IndentGuides.

interface Props {
    level:          number
    /** For each ancestor level, whether that ancestor is its parent's last child. */
    ancestorIsLast: boolean[]
    isLastSibling:  boolean
    /** Draws a short elbow into the row even when siblings follow it (folders). */
    elbow?:         boolean
}

/**
 * The branch lines left of a tree row: one 20px column per level. Ancestor
 * columns continue while that ancestor has siblings below; the innermost column
 * ends in an elbow at the last child.
 */
export function IndentGuides({ level, ancestorIsLast, isLastSibling, elbow = false }: Props) {
    return (
        <>
            {Array.from({ length: level }).map((_, index) => {
                const isInnermost = index === level - 1

                return (
                    <span key={index} className='relative w-5 shrink-0 self-stretch opacity-20'>
                        {isInnermost && <InnermostGuide isLastSibling={isLastSibling} elbow={elbow} />}

                        {!isInnermost && !ancestorIsLast[index + 1] && (
                            <span className='absolute inset-y-0 left-[7px] border-l border-accent-foreground' />
                        )}
                    </span>
                )
            })}
        </>
    )
}

interface InnermostGuideProps {
    isLastSibling: boolean
    elbow:         boolean
}

function InnermostGuide({ isLastSibling, elbow }: InnermostGuideProps) {
    if (isLastSibling)
        return <span className='absolute top-0 right-0.5 left-[7px] h-1/2 rounded-bl-lg border-b border-l border-accent-foreground' />

    return (
        <>
            <span className='absolute inset-y-0 left-[7px] border-l border-accent-foreground' />

            {elbow && (
                <span
                    className={cn(
                        'absolute top-[calc(50%-8px)] right-0.5 left-[7px] h-2',
                        'rounded-bl-lg border-b border-l border-accent-foreground',
                    )}
                />
            )}
        </>
    )
}
