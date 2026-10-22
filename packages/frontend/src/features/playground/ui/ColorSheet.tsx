import { useRef, type ReactNode } from 'react'
import type { Theme } from '../catalog'
import { useColorValues } from './useColorValues'
import './color-sheet.css'

export interface ColorSwatch {
    id: string
    label: string
    token: string
    color?: string
    sample?: ReactNode
}

export interface ColorGroup {
    title: string
    colors: readonly ColorSwatch[]
}

interface ColorSheetProps {
    theme: Theme
    description: string
    groups: readonly ColorGroup[]
}

export function ColorSheet({ theme, description, groups }: ColorSheetProps) {
    const container = useRef<HTMLDivElement>(null)
    const values = useColorValues(container, theme)

    return (
        <div ref={container} className='color-sheet'>
            <p className='demo-note'>{description}</p>

            {groups.map(group => (
                <section className='color-sheet-group' key={group.title}>
                    <h4>{group.title}</h4>
                    <dl className='color-sheet-grid'>
                        {group.colors.map(color => (
                            <div className='color-sheet-tile' key={color.id}>
                                <dt>
                                    <div className='color-sheet-checker' aria-hidden='true' inert>
                                        <div
                                            className='color-sheet-swatch'
                                            data-color-swatch={color.id}
                                            style={{ backgroundColor: color.color }}
                                        >
                                            {color.sample}
                                        </div>
                                    </div>
                                    <span className='color-sheet-name'>{color.label}</span>
                                </dt>
                                <dd>
                                    <code className='color-sheet-token' title={color.token}>{color.token}</code>
                                    <span className='color-sheet-value'>{values[color.id] ?? '…'}</span>
                                </dd>
                            </div>
                        ))}
                    </dl>
                </section>
            ))}
        </div>
    )
}
