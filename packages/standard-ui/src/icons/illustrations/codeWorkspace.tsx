import { useId, type CSSProperties } from 'react'
import { cn } from '../../utils/cn'

export interface CodeWorkspaceIllustrationProps {
    className?: string
    style?:     CSSProperties
}

// Typology's Code Workspace marks (typology-icons/code-workspace): a violet
// brick with `</>` on its face. Gradient and filter ids are per instance
// (useId), so several on a page don't share — or lose — each other's.

/**
 * The brick in isometric view, studs on top — large places (cards) and app
 * marks (launchpad, sidebar, header). Its view box is cropped to the brick (the
 * drawing's 256 square has wide margins; the shadow's tail is cut), so it fills its box.
 */
export function CodeWorkspaceIllustration({ className, style }: CodeWorkspaceIllustrationProps) {
    const id = useId()
    const url = (name: string) => `url(#${name}${id})`

    return (
        <svg viewBox='44 52 172 172' fill='none' xmlns='http://www.w3.org/2000/svg' aria-hidden className={cn('shrink-0', className)} style={style}>
            <defs>
                <linearGradient id={`stud${id}`} x1='0' y1='0' x2='1' y2='0'>
                    <stop offset='0' stopColor='#8F6EFA' />
                    <stop offset='0.35' stopColor='#A189FF' />
                    <stop offset='1' stopColor='#6B48E8' />
                </linearGradient>
                <linearGradient id={`studTop${id}`} x1='0' y1='0' x2='0.6' y2='1'>
                    <stop offset='0' stopColor='#C2B0FF' />
                    <stop offset='1' stopColor='#AA92FF' />
                </linearGradient>
                <linearGradient id={`top${id}`} x1='0' y1='0' x2='1' y2='1'>
                    <stop offset='0' stopColor='#B49DFF' />
                    <stop offset='1' stopColor='#9F83FF' />
                </linearGradient>
                <linearGradient id={`front${id}`} x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0' stopColor='#8764F8' />
                    <stop offset='1' stopColor='#6D49EE' />
                </linearGradient>
                <linearGradient id={`right${id}`} x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0' stopColor='#6946E6' />
                    <stop offset='1' stopColor='#5333D0' />
                </linearGradient>
                <filter id={`soft${id}`} x='-40%' y='-80%' width='180%' height='260%'>
                    <feGaussianBlur stdDeviation='8' />
                </filter>
                <filter id={`blur${id}`} x='-40%' y='-80%' width='180%' height='260%'>
                    <feGaussianBlur stdDeviation='2.5' />
                </filter>
            </defs>
            <g transform='translate(6 -12)'>
                <path d='M38 196 L158 220 L214 186 L94 164 Z' fill='#1B0F4A' opacity='0.3' filter={url('soft')} />
                <path d='M38 118 L158 140 L210 110 L90 88 Z' fill={url('top')} />
                <path d='M158 140 L210 110 L210 182 L158 212 Z' fill={url('right')} />
                <path d='M38 118 L158 140 L158 212 L38 190 Z' fill={url('front')} />
                <path d='M38 118 L158 140 L210 110' stroke='#FFFFFF' strokeOpacity='0.35' strokeWidth='1.5' />
                <ellipse cx='100.4' cy='112.5' rx='25' ry='11' fill='#6440E4' opacity='0.35' filter={url('blur')} />
                <path d='M72.4 92.9 V108.9 A24 12 0 0 0 120.4 108.9 V92.9 Z' fill={url('stud')} />
                <ellipse cx='96.4' cy='92.9' rx='24' ry='12' fill={url('studTop')} />
                <ellipse cx='155.6' cy='122.7' rx='25' ry='11' fill='#6440E4' opacity='0.35' filter={url('blur')} />
                <path d='M127.6 103.1 V119.1 A24 12 0 0 0 175.6 119.1 V103.1 Z' fill={url('stud')} />
                <ellipse cx='151.6' cy='103.1' rx='24' ry='12' fill={url('studTop')} />
                <g transform='matrix(1 0.1833 0 1 38 118)' strokeWidth='8.5' strokeLinecap='round' strokeLinejoin='round'>
                    <CodeMark stroke='#5532D2' transform='translate(0 2)' paths={ISOMETRIC_MARK} />
                    <CodeMark stroke='#EFE9FF' paths={ISOMETRIC_MARK} />
                </g>
            </g>
        </svg>
    )
}

/** The brick seen from the front — small places: rows, pickers, dialog headers. */
export function CodeWorkspaceFrontIllustration({ className, style }: CodeWorkspaceIllustrationProps) {
    const id = useId()
    const url = (name: string) => `url(#${name}${id})`

    return (
        <svg viewBox='0 0 32 32' fill='none' xmlns='http://www.w3.org/2000/svg' aria-hidden className={cn('shrink-0', className)} style={style}>
            <defs>
                <linearGradient id={`body${id}`} x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0' stopColor='#8764F8' />
                    <stop offset='1' stopColor='#6A46EC' />
                </linearGradient>
                <linearGradient id={`stud${id}`} x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0' stopColor='#A88EFF' />
                    <stop offset='1' stopColor='#8E6EFA' />
                </linearGradient>
                <filter id={`soft${id}`} x='-30%' y='-100%' width='160%' height='300%'>
                    <feGaussianBlur stdDeviation='1' />
                </filter>
            </defs>
            <ellipse cx='16' cy='27' rx='12' ry='1.5' fill='#1B0F4A' opacity='0.25' filter={url('soft')} />
            <rect x='6' y='5' width='8' height='4' fill={url('stud')} />
            <rect x='18' y='5' width='8' height='4' fill={url('stud')} />
            <rect x='4' y='9' width='24' height='17' fill={url('body')} />
            <path d='M4 9.375 H28' stroke='#FFFFFF' strokeOpacity='0.35' strokeWidth='0.75' />
            <g strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                <CodeMark stroke='#5532D2' transform='translate(0 0.75)' paths={FRONT_MARK} />
                <CodeMark stroke='#EFE9FF' paths={FRONT_MARK} />
            </g>
        </svg>
    )
}

/** `</>` on the face: `<`, `>`, `/`. */
const ISOMETRIC_MARK = ['M45 21 L31 36 L45 51', 'M75 21 L89 36 L75 51', 'M66 17 L54 55']

const FRONT_MARK = ['M12.5 14.5 L10 17.5 L12.5 20.5', 'M19.5 14.5 L22 17.5 L19.5 20.5', 'M17 13.5 L15 21.5']

/** The mark once: drawn twice per brick — its shadow, then itself. */
function CodeMark({ stroke, transform, paths }: { stroke: string; transform?: string; paths: string[] }) {
    return (
        <g stroke={stroke} transform={transform}>
            {paths.map(d => <path key={d} d={d} />)}
        </g>
    )
}
