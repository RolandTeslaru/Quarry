import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

const DEFAULT_STALE_TIME = 30_000
const MAX_QUERY_RETRIES = 1
const NON_RETRYABLE_STATUSES = new Set([401, 403, 404])

export class QuerySDKImpl {

    public readonly client = new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: DEFAULT_STALE_TIME,
                retry: (failureCount, error) => {
                    if (isAxiosError(error)) {
                        const status = error.response?.status

                        if (status !== undefined && NON_RETRYABLE_STATUSES.has(status))
                            return false
                    }

                    return failureCount < MAX_QUERY_RETRIES
                },
            },
        },
    })

    public cleanup(): void {
        void this.client.cancelQueries()
        this.client.clear()
    }

    public Provider = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={this.client}>
            {children}
        </QueryClientProvider>
    )
}

export const QuerySDK = new QuerySDKImpl()
