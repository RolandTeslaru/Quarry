import type { ReactNode } from 'react'

interface Props {
    eyebrow?:     string
    title:        string
    description?: string
    actions?:     ReactNode
}

export function PageHeader({ eyebrow, title, description, actions }: Props) {
    return (
        <header className='page-header'>
            <div>
                {eyebrow && (
                    <div className='eyebrow'>{eyebrow}</div>
                )}

                <h1>{title}</h1>

                {description && (
                    <p>{description}</p>
                )}
            </div>

            <div className='flex items-center gap-2'>
                {actions}
            </div>
        </header>
    )
}
