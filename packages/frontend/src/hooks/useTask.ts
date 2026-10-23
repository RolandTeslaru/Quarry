import { useState } from 'react'
import { errorMessage } from '@/SDKs/api'

/**
 * A localized task: one action a component runs (a submit, a button), with its
 * pending state and its last error as a readable message.
 *
 *   const [task, withTask] = useTask()
 *
 *   <Button loading={task.pending} onClick={withTask(() => DataConnectionSDK.actions.source.test(rid))} />
 *
 * `withTask(fn)` wraps a function so calling it runs as the task — for event
 * handlers; `task.run(fn)` runs one directly. A failure is caught into
 * `task.error`, never rethrown.
 */
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

    const withTask = <Args extends unknown[], Result>(operation: (...args: Args) => Promise<Result>) =>
        (...args: Args): void => {
            void run(() => operation(...args))
        }

    const task = {
        pending,
        error,
        reset,
        run,
    }

    return [task, withTask] as const
}
