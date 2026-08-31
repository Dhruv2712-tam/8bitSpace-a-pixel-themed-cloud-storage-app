import { createClient } from '@supabase/supabase-js'

const cleanEnvironmentValue = value => value?.trim().replace(/^['"]|['"]$/g, '') || ''

const rawSupabaseUrl = cleanEnvironmentValue(import.meta.env.VITE_SUPABASE_URL)

// Vercel users sometimes paste an API endpoint such as `/auth/v1` instead of
// the project URL. Supabase clients need the project origin only.
export const supabaseUrl = (() => {
  try { return new URL(rawSupabaseUrl).origin }
  catch { return rawSupabaseUrl }
})()

export const supabasePublishableKey = cleanEnvironmentValue(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
