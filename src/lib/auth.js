import { supabase, supabaseUrl, supabasePublishableKey } from './supabase'

const providerNames = { google: 'Google', github: 'GitHub' }

export function oauthOptions(provider, origin) {
  if (!Object.hasOwn(providerNames, provider)) throw new Error('Unsupported sign-in provider.')
  const url = new URL(origin)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Sign-in requires a secure website address.')
  }
  return {
    provider,
    options: {
      redirectTo: `${url.origin}/?auth=callback`,
      skipBrowserRedirect: true,
      ...(provider === 'github' ? { scopes: 'read:user user:email' } : { queryParams: { prompt: 'select_account' } }),
    },
  }
}

export async function startSocialSignIn(provider) {
  const options = oauthOptions(provider, window.location.origin)
  if (!supabase) throw new Error('Sign-in is temporarily unavailable.')
  const response = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabasePublishableKey }, cache: 'no-store', signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error('Could not check sign-in availability. Please try again.')
  const settings = await response.json()
  if (!settings.external?.[provider]) throw new Error(`${providerNames[provider]} sign-in is not available yet. Please use email for now.`)
  const { data, error } = await supabase.auth.signInWithOAuth(options)
  if (error) throw new Error('Could not start sign-in. Please try again.')
  const destination = new URL(data.url)
  if (destination.origin !== new URL(supabaseUrl).origin || destination.pathname !== '/auth/v1/authorize') {
    throw new Error('The sign-in destination could not be verified.')
  }
  window.location.assign(destination.href)
}

export function authCallbackState(href) {
  const url = new URL(href)
  const hash = new URLSearchParams(url.hash.slice(1))
  const error = url.searchParams.get('error') || hash.get('error')
  const failed = Boolean(error || url.searchParams.has('error_description') || hash.has('error_description'))
  return {
    isCallback: url.searchParams.get('auth') === 'callback' || url.searchParams.has('code') || failed,
    message: failed ? (error === 'access_denied' ? 'Sign-in was cancelled. You can try again or use email.' : 'Sign-in could not be completed. Please try again.') : '',
  }
}

export function clearAuthCallback(href) {
  const url = new URL(href)
  for (const key of ['auth', 'code', 'error', 'error_code', 'error_description']) url.searchParams.delete(key)
  const hash = new URLSearchParams(url.hash.slice(1))
  if (['access_token', 'refresh_token', 'error', 'error_description'].some(key => hash.has(key))) url.hash = ''
  return `${url.pathname}${url.search}${url.hash}`
}
