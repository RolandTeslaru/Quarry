import axios from 'axios';
import { authClient } from './AuthSDK/client';

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '', timeout: 25_000 });

api.interceptors.request.use(async (request) => {
    const { data } = await authClient.getSession();
    if (data.session) request.headers.Authorization = `Bearer ${data.session.access_token}`;
    return request;
});

export function errorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
        const message: unknown = error.response?.data?.message;
        if (Array.isArray(message)) return message.join('\n');
        if (typeof message === 'string') return message;
        if (!error.response) return 'Cannot reach Quarry. Check that the API is running and try again.';
    }
    return error instanceof Error ? error.message : String(error);
}
