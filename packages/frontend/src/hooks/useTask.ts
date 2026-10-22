import { useState } from 'react'
import { errorMessage } from '@/SDKs/api'

export function useTask() {
    const [pending, setPending] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reset = () => setError(null)

    const run = async <Result,>(operation: () => Promise<Result>): Promise<Result | undefined> => {
        setError(null)
        setPending(true)

        try {
            return await operation()
        } catch (error) {
            setError(errorMessage(error))
        } finally {
            setPending(false)
        }
    }

    return {
        pending,
        error,
        reset,
        run,
    }
}
