import { Callout } from '@quarry/standard-ui/foundations/callout'
import { errorMessage } from '@/SDKs/api'

interface Props {
    error: unknown
}

export function ErrorNotice({ error }: Props) {
    if (!error)
        return null

    const message = typeof error === 'string' ? error : errorMessage(error)

    return (
        <Callout
            intent='danger'
            icon='error'
            className='my-3'
            role='alert'
        >
            {message}
        </Callout>
    )
}
