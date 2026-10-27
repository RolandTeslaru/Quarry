import type { CSSProperties } from 'react'
import { cn } from '../../utils/cn'

export interface AnvilIllustrationProps {
    className?: string
    style?:     CSSProperties
}

// "Anvil" by Masrur Mahmood, from the Noun Project (CC BY 3.0). Drawn in
// currentColor, so it takes the text colour like an Icon.

/** The anvil, flat — Forge. Centred in a square view box, so it sizes like an Icon. */
export function AnvilIllustration({ className, style }: AnvilIllustrationProps) {
    return (
        <svg viewBox='0 -23.626 100 100' fill='currentColor' xmlns='http://www.w3.org/2000/svg' aria-hidden className={cn('shrink-0', className)} style={style}>
            <path d='M0 2.512h30.769V0H100v4.396c0 0-32.967 1.928-32.967 21.978 0 20.049 18.368 21.35 18.368 21.35v5.024H24.176v-5.024c0 0 16.483-1.018 16.483-14.756 0-13.74-17.603-13.187-17.603-13.187C4.396 19.78 0 2.512 0 2.512z' />
        </svg>
    )
}
