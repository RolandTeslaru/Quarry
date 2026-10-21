import { QueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

export const queryClient = new QueryClient({ defaultOptions: { queries: {
    staleTime: 30_000,
    retry: (count, error) => !(isAxiosError(error) && [401, 403, 404].includes(error.response?.status ?? 0)) && count < 1,
} } });

let sessionVersion = 0;
export const currentSession = () => sessionVersion;
export function clearSession(): void {
    sessionVersion++;
    void queryClient.cancelQueries();
    queryClient.clear();
}

export async function inSession<T>(load: () => Promise<T>, apply: (value: T) => void): Promise<T> {
    const version = sessionVersion;
    const result = await load();
    if (version === sessionVersion) apply(result);
    return result;
}
