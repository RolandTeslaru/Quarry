import { useId, type CSSProperties } from 'react'
import { cn } from '../../utils/cn'

export interface FolderIllustrationProps {
    /** Base color — every shade is derived from this. Defaults to charcoal. */
    color?: string
    className?: string
    style?: CSSProperties
}

// From PretzelGraph (standard-ui/src/icons/illustrations/folder.tsx).
// Top/mid shading is constant; the deep bottom shades flip per theme so light
// mode doesn't go muddy at the bottom (--folder-deep/-deepest/-line).
export function FolderIllustration({ color = '#454c54', className, style }: FolderIllustrationProps) {
    const id = useId()

    return (
        <svg
            viewBox='0 0 600 600'
            fill='none'
            xmlns='http://www.w3.org/2000/svg'
            className={cn(
                'shrink-0 [--folder-deep:90%] [--folder-deepest:84%] [--folder-line:80%]',
                'dark:[--folder-deep:75%] dark:[--folder-deepest:66%] dark:[--folder-line:60%]',
                className,
            )}
            style={{ ['--folder-color' as string]: color, ...style }}
        >
            <defs>
                <linearGradient id={`folderBack${id}`} x1='300' y1='104' x2='300' y2='200' gradientUnits='userSpaceOnUse'>
                    <stop offset='0' stopColor='color-mix(in srgb, var(--folder-color) 86%, black)' />
                    <stop offset='1' stopColor='color-mix(in srgb, var(--folder-color) var(--folder-deep), black)' />
                </linearGradient>
                <linearGradient id={`folderBody${id}`} x1='300' y1='172' x2='300' y2='530' gradientUnits='userSpaceOnUse'>
                    <stop offset='0' stopColor='color-mix(in srgb, var(--folder-color) 86%, black)' />
                    <stop offset='0.16' stopColor='var(--folder-color)' />
                    <stop offset='0.55' stopColor='color-mix(in srgb, var(--folder-color) 88%, black)' />
                    <stop offset='1' stopColor='color-mix(in srgb, var(--folder-color) var(--folder-deep), black)' />
                </linearGradient>
                <linearGradient id={`folderLip${id}`} x1='300' y1='470' x2='300' y2='535' gradientUnits='userSpaceOnUse'>
                    <stop offset='0' stopColor='color-mix(in srgb, var(--folder-color) var(--folder-deep), black)' />
                    <stop offset='1' stopColor='color-mix(in srgb, var(--folder-color) var(--folder-deepest), black)' />
                </linearGradient>
                <filter id={`folderShadow${id}`} x='-20%' y='-20%' width='140%' height='140%'>
                    <feDropShadow dx='0' dy='6' stdDeviation='8' floodColor='#000000' floodOpacity='0.28' />
                </filter>
                <linearGradient id={`folderHighlight${id}`} x1='300' y1='172' x2='300' y2='222' gradientUnits='userSpaceOnUse'>
                    <stop offset='0' stopColor='#ffffff' stopOpacity='0.09' />
                    <stop offset='1' stopColor='#ffffff' stopOpacity='0' />
                </linearGradient>
            </defs>

            <g filter={`url(#folderShadow${id})`}>
                <path
                    d='M58 172 L58 122 Q58 104 76 104 L190 104 Q206 104 215 119 L239 142 Q251 153 272 153 L520 153 Q542 153 542 175 L542 240 L58 240 Z'
                    fill={`url(#folderBack${id})`}
                />
                <path
                    d='M40 480 L560 480 L560 505 Q560 535 530 535 L70 535 Q40 535 40 505 Z'
                    fill={`url(#folderLip${id})`}
                />
                <line x1='55' y1='498' x2='545' y2='498' stroke='color-mix(in srgb, var(--folder-color) var(--folder-line), black)' strokeWidth='2' opacity='0.6' />
                <line x1='55' y1='510' x2='545' y2='510' stroke='color-mix(in srgb, var(--folder-color) var(--folder-line), black)' strokeWidth='2' opacity='0.5' />
                <path
                    d='M40 194 Q40 172 62 172 L538 172 Q560 172 560 194 L560 500 Q560 510 552 510 L48 510 Q40 510 40 500 Z'
                    fill={`url(#folderBody${id})`}
                />
                <path
                    d='M40 194 Q40 172 62 172 L538 172 Q560 172 560 194 L560 215 L40 215 Z'
                    fill={`url(#folderHighlight${id})`}
                />
            </g>
        </svg>
    )
}
