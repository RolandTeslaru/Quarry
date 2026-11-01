import { GoTrueClient } from '@supabase/auth-js'

const AUTH_URL = import.meta.env.VITE_AUTH_URL || `${window.location.origin}/auth-api`
const STORAGE_KEY = 'quarry.auth'

export const authClient = new GoTrueClient({
    url: AUTH_URL,
    storageKey: STORAGE_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
})
