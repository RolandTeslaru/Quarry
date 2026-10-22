import axios from 'axios'
import { authClient } from './AuthSDK/client'

const REQUEST_TIMEOUT_MS = 25_000

let sessionRequests = new AbortController()

export function cancelSessionRequests(): void {
    sessionRequests.abort()
    sessionRequests = new AbortController()
}

export const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '',
    timeout: REQUEST_TIMEOUT_MS,
})

api.interceptors.request.use(async request => {
    request.signal = sessionRequests.signal

    const { data } = await authClient.getSession()

    if (data.session)
        request.headers.Authorization = `Bearer ${data.session.access_token}`

    return request
})

export function errorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
        const message: unknown = error.response?.data?.message

        if (Array.isArray(message))
            return message.join('\n')

        if (typeof message === 'string')
            return message

        if (!error.response)
            return 'Cannot reach Quarry. Check that the API is running and try again.'
    }

    return error instanceof Error ? error.message : String(error)
}
