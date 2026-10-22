import { useEffect, useRef, useState } from 'react'
import { matchingSamples, samples, type Theme } from '../catalog'
import { readPreviewMessage, type RowHeights } from '../preview-messages'
import './playground.css'

export function Playground() {
    const [theme, setTheme] = useState<Theme>('dark')
    const [filter, setFilter] = useState('')
    const [synchronized, setSynchronized] = useState(true)
    const standardFrame = useRef<HTMLIFrameElement>(null)
    const blueprintFrame = useRef<HTMLIFrameElement>(null)
    const rowHeights = useRef<RowHeights>({})

    useEffect(() => {
        function synchronizeScroll(event: MessageEvent<unknown>) {
            if (event.origin !== window.location.origin) {
                return
            }

            const isStandard = event.source === standardFrame.current?.contentWindow
            const isBlueprint = event.source === blueprintFrame.current?.contentWindow

            if (!isStandard && !isBlueprint) {
                return
            }

            const data = readPreviewMessage(event.data)

            if (!data) {
                return
            }

            if (data.type === 'playground-heights') {
                for (const sample of samples) {
                    const height = data.heights[sample.id]

                    if (height !== undefined) {
                        rowHeights.current[sample.id] = Math.max(rowHeights.current[sample.id] ?? 0, height)
                    }
                }

                const message = { type: 'playground-heights', heights: rowHeights.current }

                standardFrame.current?.contentWindow?.postMessage(message, window.location.origin)
                blueprintFrame.current?.contentWindow?.postMessage(message, window.location.origin)
                return
            }

            if (!synchronized || data.type !== 'playground-scroll') {
                return
            }

            let target: Window | null | undefined

            if (event.source === standardFrame.current?.contentWindow) {
                target = blueprintFrame.current?.contentWindow
            } else if (event.source === blueprintFrame.current?.contentWindow) {
                target = standardFrame.current?.contentWindow
            }

            target?.postMessage({ type: 'playground-scroll-to', top: data.top }, window.location.origin)
        }

        window.addEventListener('message', synchronizeScroll)

        return () => window.removeEventListener('message', synchronizeScroll)
    }, [synchronized])

    const search = new URLSearchParams({ theme, filter })
    const count = matchingSamples(filter).length

    return (
        <main className='playground'>
            <header className='playground-toolbar'>
                <div>
                    <div className='playground-eyebrow'>QUARRY / COMPONENT LAB</div>
                    <h1>Two libraries. Same playground.</h1>
                    <p>
                        Open, hover, type, and compare. {count} of {samples.length} component pairs.
                    </p>
                </div>

                <div className='playground-controls'>
                    <label>
                        <span>Find a component</span>
                        <input
                            type='search'
                            placeholder='Popover, inputs, dates…'
                            value={filter}
                            onChange={(event) => setFilter(event.target.value)}
                        />
                    </label>
                    <label>
                        <span>Appearance</span>
                        <select
                            value={theme}
                            onChange={(event) => setTheme(event.target.value === 'light' ? 'light' : 'dark')}
                        >
                            <option value='dark'>Dark</option>
                            <option value='light'>Light</option>
                        </select>
                    </label>
                    <label className='playground-sync'>
                        <input
                            type='checkbox'
                            checked={synchronized}
                            onChange={(event) => setSynchronized(event.target.checked)}
                        />
                        Sync scroll
                    </label>
                </div>
            </header>

            <div className='playground-columns'>
                <section className='playground-column'>
                    <header className='playground-library'>
                        <span className='playground-library-marker standard-marker' />
                        <div>
                            <h2>PretzelGraph standard-ui</h2>
                            <p>Current components + current global CSS</p>
                        </div>
                        <span className='playground-library-label'>RADIX</span>
                    </header>
                    <iframe
                        ref={standardFrame}
                        title='PretzelGraph standard UI component examples'
                        src={`/playground/standard?${search}`}
                    />
                </section>
                <section className='playground-column'>
                    <header className='playground-library'>
                        <span className='playground-library-marker blueprint-marker' />
                        <div>
                            <h2>Blueprint</h2>
                            <p>Original Blueprint styling + equivalent controls</p>
                        </div>
                        <span className='playground-library-label'>BLUEPRINT 6</span>
                    </header>
                    <iframe
                        ref={blueprintFrame}
                        title='Blueprint component examples'
                        src={`/playground/blueprint?${search}`}
                    />
                </section>
            </div>
        </main>
    )
}
