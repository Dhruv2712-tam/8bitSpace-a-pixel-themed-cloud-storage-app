import { createClient } from '@supabase/supabase-js'
import { publicConfig } from './security'

let config = null
try {
  config = publicConfig(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, import.meta.env.PROD)
} catch { /* Missing configuration is shown by the app. */ }
export const supabaseUrl = config?.url || ''
export const supabasePublishableKey = config?.key || ''
export const isSupabaseConfigured = Boolean(config)
export const supabase = config ? createClient(config.url, config.key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
}) : null
