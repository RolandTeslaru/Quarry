import { useId, type CSSProperties } from 'react'
import { cn } from '../../utils/cn'

export interface DataConnectionIllustrationProps {
    className?: string
    style?:     CSSProperties
}

// Typology's Data Connection mark (typology-icons/data-connection): a stack of
// three copper discs. Gradient and filter ids are per instance (useId),
// so several on a page don't share — or lose — each other's.

/**
 * The stack — app marks (launchpad, sidebar, header). Its view box is cropped
 * to the stack (the drawing's 256 square has wide margins), so it fills its box.
 */
export function DataConnectionIllustration({ className, style }: DataConnectionIllustrationProps) {
    const id = useId()
    const url = (name: string) => `url(#${name}${id})`

    return (
        <svg viewBox='33 35 190 190' fill='none' xmlns='http://www.w3.org/2000/svg' aria-hidden className={cn('shrink-0', className)} style={style}>
            <defs>
                <linearGradient id={`side${id}`} x1='0' y1='0' x2='1' y2='0'>
                    <stop offset='0' stopColor='#A75F2A' />
                    <stop offset='0.12' stopColor='#D57935' />
                    <stop offset='0.42' stopColor='#F1B589' />
                    <stop offset='0.58' stopColor='#EB9658' />
                    <stop offset='0.88' stopColor='#D57935' />
                    <stop offset='1' stopColor='#A75F2A' />
                </linearGradient>
                <radialGradient id={`top${id}`} cx='0.45' cy='0.4' r='0.7'>
                    <stop offset='0' stopColor='#F5C8A6' />
                    <stop offset='1' stopColor='#EEA671' />
                </radialGradient>
                <filter id={`soft${id}`} x='-30%' y='-80%' width='160%' height='260%'>
                    <feGaussianBlur stdDeviation='7' />
                </filter>
                <filter id={`blur${id}`} x='-20%' y='-60%' width='140%' height='220%'>
                    <feGaussianBlur stdDeviation='3' />
                </filter>
            </defs>
            <ellipse cx='128' cy='224' rx='88' ry='9' fill='#000000' opacity='0.28' filter={url('soft')} />

            <path d='M46 158 V202 A82 22 0 0 0 210 202 V158 Z' fill={url('side')} />
            <path d='M48 200 A80 21 0 0 0 208 200' stroke='#804920' strokeOpacity='0.45' strokeWidth='3' />
            <ellipse cx='128' cy='158' rx='82' ry='22' fill={url('top')} />
            <ellipse cx='128' cy='160' rx='80' ry='20' fill='#000000' opacity='0.3' filter={url('blur')} />

            <path d='M46 108 V152 A82 22 0 0 0 210 152 V108 Z' fill={url('side')} />
            <path d='M48 150 A80 21 0 0 0 208 150' stroke='#804920' strokeOpacity='0.45' strokeWidth='3' />
            <path d='M47 110 A81 21.5 0 0 0 209 110' stroke='#FFFFFF' strokeOpacity='0.45' strokeWidth='1.5' />
            <ellipse cx='128' cy='108' rx='82' ry='22' fill={url('top')} />
            <ellipse cx='128' cy='110' rx='80' ry='20' fill='#000000' opacity='0.3' filter={url('blur')} />

            <path d='M46 58 V102 A82 22 0 0 0 210 102 V58 Z' fill={url('side')} />
            <path d='M47 60 A81 21.5 0 0 0 209 60' stroke='#FFFFFF' strokeOpacity='0.45' strokeWidth='1.5' />
            <ellipse cx='128' cy='58' rx='82' ry='22' fill={url('top')} stroke='#FFFFFF' strokeOpacity='0.5' strokeWidth='1.5' />
            <ellipse cx='128' cy='59' rx='74' ry='18' fill='#FFFFFF' opacity='0.12' />
        </svg>
    )
}
