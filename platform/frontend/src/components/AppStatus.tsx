import type { ReactNode } from 'react'
import applicationStyles from '@/styles.css?inline'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'

interface Props {
    title:    string
    detail?:  string
    loading?: boolean
    actions?: ReactNode
}

export function AppStatus({ title, detail, loading = false, actions }: Props) {
    return (
        <main className='app-status'>
            <style>{applicationStyles}</style>
            <div className='brand-mark'>Q</div>

            {loading && <Spinner className='size-6' role='status' aria-label='Loading' />}

            <h1>{title}</h1>

            {detail && <p>{detail}</p>}

            <div className='flex gap-2'>
                {actions}
            </div>
        </main>
    )
}
