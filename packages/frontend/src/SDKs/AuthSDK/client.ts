import { GoTrueClient } from '@supabase/auth-js';

export const authClient = new GoTrueClient({
    url: import.meta.env.VITE_AUTH_URL || `${window.location.origin}/auth`,
    storageKey: 'quarry.auth',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
});
