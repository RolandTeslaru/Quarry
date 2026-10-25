import { useId, type CSSProperties } from 'react'
import { cn } from '../../utils/cn'

export interface FolderIllustrationProps {
    className?: string
    style?:     CSSProperties
}

// Typology's Library Explorer marks (typology-icons/library-explorer): an amber
// folder with a sheet of paper inside. Gradient and filter ids are per instance
// (useId), so several on a page don't share — or lose — each other's.

/**
 * The folder, shaded — large places (cards) and app marks (launchpad, header,
 * home). Its view box is cropped to the folder (the drawing's 256 square has
 * wide margins), so it fills its box.
 */
export function FolderIllustration({ className, style }: FolderIllustrationProps) {
    const id = useId()
    const url = (name: string) => `url(#${name}${id})`

    return (
        <svg viewBox='12 28 232 232' fill='none' xmlns='http://www.w3.org/2000/svg' aria-hidden className={cn('shrink-0', className)} style={style}>
            <defs>
                <linearGradient id={`back${id}`} x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0' stopColor='#D39728' />
                    <stop offset='1' stopColor='#C48D25' />
                </linearGradient>
                <linearGradient id={`front${id}`} x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0' stopColor='#F6B947' />
                    <stop offset='1' stopColor='#D89B28' />
                </linearGradient>
                <linearGradient id={`paper${id}`} x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0' stopColor='#FFFFFF' />
                    <stop offset='1' stopColor='#F1F2F4' />
                </linearGradient>
                <filter id={`shadow${id}`} x='-20%' y='-20%' width='140%' height='150%'>
                    <feDropShadow dx='0' dy='6' stdDeviation='7' floodColor='#000000' floodOpacity='0.22' />
                </filter>
                <filter id={`blur${id}`} x='-10%' y='-100%' width='120%' height='300%'>
                    <feGaussianBlur stdDeviation='2' />
                </filter>
            </defs>
            <g filter={url('shadow')}>
                <path d='M22 72 Q22 56 38 56 H88 Q98 56 104 63 L111 71 Q117 78 127 78 H218 Q234 78 234 94 V130 H22 Z' fill={url('back')} />
                <rect x='30' y='86' width='196' height='40' rx='6' fill={url('paper')} />
                <rect x='22' y='99' width='212' height='6' fill='#000000' opacity='0.12' filter={url('blur')} />
                <rect x='18' y='100' width='220' height='122' rx='16' fill={url('front')} />
                <path d='M30 101.5 H226' stroke='#FFFFFF' strokeOpacity='0.35' strokeWidth='1.5' strokeLinecap='round' />
            </g>
        </svg>
    )
}

/** The folder, simpler — small places: dialog headers, recents. */
export function FolderFrontIllustration({ className, style }: FolderIllustrationProps) {
    const id = useId()
    const url = (name: string) => `url(#${name}${id})`

    return (
        <svg viewBox='0 0 32 32' fill='none' xmlns='http://www.w3.org/2000/svg' aria-hidden className={cn('shrink-0', className)} style={style}>
            <defs>
                <linearGradient id={`back${id}`} x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0' stopColor='#D39728' />
                    <stop offset='1' stopColor='#C48D25' />
                </linearGradient>
                <linearGradient id={`front${id}`} x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0' stopColor='#F6B947' />
                    <stop offset='1' stopColor='#D89B28' />
                </linearGradient>
                <filter id={`shadow${id}`} x='-20%' y='-20%' width='140%' height='150%'>
                    <feDropShadow dx='0' dy='0.75' stdDeviation='0.8' floodColor='#000000' floodOpacity='0.22' />
                </filter>
            </defs>
            <g filter={url('shadow')}>
                <path d='M3 8.5 Q3 6 5.5 6 H11 Q12.3 6 13 7 L13.8 8 Q14.4 8.8 15.5 8.8 H26.5 Q29 8.8 29 11.3 V15 H3 Z' fill={url('back')} />
                <rect x='4.5' y='10' width='23' height='5' rx='1' fill='#FFFFFF' />
                <rect x='2.5' y='12' width='27' height='15' rx='2.5' fill={url('front')} />
                <path d='M4 12.375 H28' stroke='#FFFFFF' strokeOpacity='0.35' strokeWidth='0.75' strokeLinecap='round' />
            </g>
        </svg>
    )
}

/** The folder, flat — inline: rows, links, the tree, menus. */
export function FolderFlatIllustration({ className, style }: FolderIllustrationProps) {
    return (
        <svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg' aria-hidden className={cn('shrink-0', className)} style={style}>
            <path d='M2 6.5 Q2 4.5 4 4.5 H8.5 Q9.5 4.5 10.2 5.3 L11 6.3 Q11.5 7 12.5 7 H20 Q22 7 22 9 V12 H2 Z' fill='#D69A28' />
            <rect x='1.5' y='9' width='21' height='11' rx='2' fill='#F5B02E' />
        </svg>
    )
}
