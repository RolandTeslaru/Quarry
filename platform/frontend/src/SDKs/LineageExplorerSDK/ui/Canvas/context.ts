import { createContext, useContext } from 'react'
import type { LineageCanvasState } from './useLineageCanvas'

export const LineageCanvasContext = createContext<LineageCanvasState['expand'] | null>(null)

/** What a node's expand buttons call. */
export function useExpand(): LineageCanvasState['expand'] {
    const expand = useContext(LineageCanvasContext)

    if (!expand)
        throw new Error('useExpand needs a LineageCanvas')

    return expand
}
