import type { ReactNode } from 'react'
import { Spinner } from '@blueprintjs/core'

interface Props {
    title:    string
    detail?:  string
    loading?: boolean
    actions?: ReactNode
}

export function AppStatus({ title, detail, loading = false, actions }: Props) {
    return (
        <main className='app-status'>
            <div className='brand-mark'>Q</div>

            {loading && <Spinner size={24} />}

            <h1>{title}</h1>

            {detail && <p>{detail}</p>}

            <div className='flex gap-2'>
                {actions}
            </div>
        </main>
    )
}
