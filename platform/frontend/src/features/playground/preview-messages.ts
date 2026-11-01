import { samples, type SampleId } from './catalog'

export type RowHeights = Partial<Record<SampleId, number>>

export type PreviewMessage =
    | { type: 'playground-scroll' | 'playground-scroll-to'; top: number }
    | { type: 'playground-heights'; heights: RowHeights }

export function readPreviewMessage(value: unknown): PreviewMessage | null {
    if (typeof value !== 'object' || value === null || !('type' in value)) {
        return null
    }

    if (value.type === 'playground-scroll' || value.type === 'playground-scroll-to') {
        if (!('top' in value) || typeof value.top !== 'number' || !Number.isFinite(value.top)) {
            return null
        }

        return { type: value.type, top: value.top }
    }

    if (value.type !== 'playground-heights' || !('heights' in value)) {
        return null
    }

    const heights = value.heights

    if (typeof heights !== 'object' || heights === null) {
        return null
    }

    const result: RowHeights = {}

    for (const sample of samples) {
        const height: unknown = Reflect.get(heights, sample.id)

        if (typeof height === 'number' && Number.isFinite(height) && height > 0 && height < 5000) {
            result[sample.id] = height
        }
    }

    return { type: 'playground-heights', heights: result }
}
