import React, { useState, useEffect } from 'react'

export const DIALOG_STACK_Z_INDEX = 51

const ENTRY_DELAY_MS = 300
const ENTRY_ANIMATION_MS = 400

export function useAnimationDelay(isOpen: boolean): React.CSSProperties {
    const [entered, setEntered] = useState(false)

    useEffect(() => {
        const timer = setTimeout(() => setEntered(true), ENTRY_DELAY_MS + ENTRY_ANIMATION_MS)
        return () => clearTimeout(timer)
    }, [])

    if (isOpen && !entered) {
        return {
            animationDelay: `${ENTRY_DELAY_MS}ms`,
            animationFillMode: 'both',
        }
    }
    return {}
}

export const SPLIT_SHELL = `
    rounded-2xl flex flex-row
    before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit]
    before:shadow-2xl before:shadow-neutral-500/60 dark:before:shadow-black/60
    data-[state=open]:before:animate-[dialog-fade-in_150ms_ease-in-out_300ms_both]
    data-[state=closed]:before:animate-[dialog-fade-out_150ms_ease-in-out_both]
`
