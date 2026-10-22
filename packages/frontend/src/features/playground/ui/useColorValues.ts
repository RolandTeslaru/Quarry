import { useEffect, useState, type RefObject } from 'react'
import type { Theme } from '../catalog'

function formatChannels(red: number, green: number, blue: number, alpha: number): string {
    const hex = [red, green, blue].map(channel => channel.toString(16).padStart(2, '0')).join('')

    if (alpha === 1) {
        return `#${hex}`
    }

    return `#${hex} · ${Math.round(alpha * 100)}%`
}

function formatColor(color: string, context: CanvasRenderingContext2D): string {
    const rgb = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/)

    if (rgb) {
        return formatChannels(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4] ?? 1))
    }

    context.clearRect(0, 0, 1, 1)
    context.fillStyle = color
    context.fillRect(0, 0, 1, 1)

    const alpha = context.getImageData(0, 0, 1, 1).data[3]

    // Sample opaque RGB separately to avoid rounding from premultiplied alpha.
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = `rgb(from ${color} r g b / 1)`
    context.fillRect(0, 0, 1, 1)

    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data

    return formatChannels(red, green, blue, alpha / 255)
}

export function useColorValues(container: RefObject<HTMLDivElement | null>, theme: Theme) {
    const [values, setValues] = useState<Record<string, string>>({})

    useEffect(() => {
        // Preview applies its theme in an effect; measure after those effects finish.
        const frame = requestAnimationFrame(() => {
            const canvas = document.createElement('canvas')
            canvas.width = 1
            canvas.height = 1

            const context = canvas.getContext('2d', { willReadFrequently: true })

            if (!context || !container.current) {
                return
            }

            const nextValues: Record<string, string> = {}

            for (const swatch of container.current.querySelectorAll<HTMLElement>('[data-color-swatch]')) {
                const id = swatch.dataset.colorSwatch
                const sample = swatch.querySelector('input, button, .bp6-card') ?? swatch

                if (id) {
                    nextValues[id] = formatColor(getComputedStyle(sample).backgroundColor, context)
                }
            }

            setValues(nextValues)
        })

        return () => cancelAnimationFrame(frame)
    }, [container, theme])

    return values
}
