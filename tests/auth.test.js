import { describe, it, expect, vi } from 'vitest'
vi.mock('../src/lib/supabase',()=>({supabase:null,supabaseUrl:'https://project.supabase.co',supabasePublishableKey:'public'}))
import { oauthOptions, authCallbackState, clearAuthCallback } from '../src/lib/auth.js'
describe('OAuth redirects and callback handling',()=>{
  it.each(['google','github'])('requests only supported %s login and a fixed same-origin callback',provider=>{
    const data=oauthOptions(provider,'https://app.example/untrusted?next=https://evil.example')
    expect(data.provider).toBe(provider)
    expect(data.options.redirectTo).toBe('https://app.example/?auth=callback')
    expect(data.options.skipBrowserRedirect).toBe(true)
  })
  it('rejects arbitrary providers and insecure sites',()=>{
    expect(()=>oauthOptions('evil','https://app.example')).toThrow()
    expect(()=>oauthOptions('google','http://app.example')).toThrow()
    expect(oauthOptions('google','http://127.0.0.1:4173').options.redirectTo).toBe('http://127.0.0.1:4173/?auth=callback')
  })
  it('requests no repository or Google Drive scopes',()=>{
    expect(oauthOptions('github','https://app.example').options.scopes).toBe('read:user user:email')
    expect(oauthOptions('google','https://app.example').options.scopes).toBeUndefined()
  })
  it('turns arbitrary provider error content into fixed safe feedback',()=>{
    const result=authCallbackState('https://app.example/?error=access_denied&error_description=visit-evil-site')
    expect(result.message).toContain('cancelled')
    expect(result.message).not.toContain('evil')
    expect(authCallbackState('https://app.example/?auth=callback&code=example').isCallback).toBe(true)
  })
  it('removes auth response data without deleting recovery routing',()=>{
    expect(clearAuthCallback('https://app.example/?auth=callback&code=test&recovery=1#error=bad')).toBe('/?recovery=1')
    expect(clearAuthCallback('https://app.example/?auth=callback&error=bad&error_description=secret')).toBe('/')
  })
})
