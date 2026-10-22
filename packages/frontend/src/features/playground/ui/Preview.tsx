import { useEffect, useRef, useState, type ComponentType } from 'react'
import { matchingSamples, type Library, type SampleId, type Theme } from '../catalog'
import { readPreviewMessage, type RowHeights } from '../preview-messages'
import './preview.css'

interface Props {
    library: Library
    theme: Theme
    filter: string
    examples: Record<SampleId, ComponentType>
}

export function Preview({ library, theme, filter, examples }: Props) {
    const [rowHeights, setRowHeights] = useState<RowHeights>({})
    const container = useRef<HTMLDivElement>(null)

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark')
        document.body.classList.toggle('bp6-dark', library === 'blueprint' && theme === 'dark')
        document.body.dataset.library = library
        document.documentElement.style.colorScheme = theme

        let synchronizedTop: number | null = null
        let pendingFrame = 0

        function onScroll() {
            if (synchronizedTop !== null && Math.abs(window.scrollY - synchronizedTop) < 2) {
                synchronizedTop = null
                return
            }

            cancelAnimationFrame(pendingFrame)
            pendingFrame = requestAnimationFrame(() => {
                window.parent.postMessage({ type: 'playground-scroll', top: window.scrollY }, window.location.origin)
            })
        }

        function onMessage(event: MessageEvent<unknown>) {
            if (event.origin !== window.location.origin || event.source !== window.parent) {
                return
            }

            const data = readPreviewMessage(event.data)

            if (!data) {
                return
            }

            if (data.type === 'playground-heights') {
                setRowHeights(data.heights)
                return
            }

            if (data.type !== 'playground-scroll-to') {
                return
            }

            synchronizedTop = Math.max(
                0,
                Math.min(data.top, document.documentElement.scrollHeight - window.innerHeight),
            )
            window.scrollTo({ top: synchronizedTop })
        }

        window.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('message', onMessage)

        return () => {
            cancelAnimationFrame(pendingFrame)
            window.removeEventListener('scroll', onScroll)
            window.removeEventListener('message', onMessage)
            document.documentElement.classList.remove('dark')
            document.body.classList.remove('bp6-dark')
            delete document.body.dataset.library
            document.documentElement.style.colorScheme = ''
        }
    }, [library, theme])

    useEffect(() => {
        const element = container.current

        if (!element) {
            return
        }

        let pendingFrame = 0

        function reportHeights() {
            cancelAnimationFrame(pendingFrame)
            pendingFrame = requestAnimationFrame(() => {
                const heights: RowHeights = {}

                for (const sample of matchingSamples(filter)) {
                    const row = element?.querySelector<HTMLElement>(`#${sample.id}`)
                    const header = row?.querySelector<HTMLElement>('.preview-row-header')
                    const example = row?.querySelector<HTMLElement>('.preview-example')

                    if (!row || !header || !example) {
                        continue
                    }

                    const style = getComputedStyle(row)
                    const margin = parseFloat(getComputedStyle(header).marginBottom)
                    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)

                    heights[sample.id] = Math.ceil(
                        Math.max(sample.height, header.offsetHeight + example.offsetHeight + margin + padding + 1),
                    )
                }

                window.parent.postMessage({ type: 'playground-heights', heights }, window.location.origin)
            })
        }

        const observer = new ResizeObserver(reportHeights)

        element.querySelectorAll('.preview-row-header, .preview-example').forEach((child) => observer.observe(child))
        reportHeights()

        return () => {
            cancelAnimationFrame(pendingFrame)
            observer.disconnect()
        }
    }, [filter])

    const visibleSamples = matchingSamples(filter)

    return (
        <div ref={container} className={`preview preview-${library}`}>
            {visibleSamples.map((sample, index) => {
                const Example = examples[sample.id]
                const api = library === 'standard' ? sample.standard : sample.blueprint

                return (
                    <section
                        key={sample.id}
                        id={sample.id}
                        className='preview-row'
                        style={{ minHeight: Math.max(sample.height, rowHeights[sample.id] ?? 0) }}
                    >
                        <header className='preview-row-header'>
                            <span className='preview-number'>{String(index + 1).padStart(2, '0')}</span>
                            <div>
                                <h3>{sample.title}</h3>
                                <code>{api}</code>
                            </div>
                            <span className='preview-group'>{sample.group}</span>
                        </header>
                        <div className='preview-example'>
                            <Example />
                        </div>
                    </section>
                )
            })}

            {visibleSamples.length === 0 && <p className='preview-no-results'>No matching components.</p>}
        </div>
    )
}
