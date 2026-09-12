import { describe, it, expect } from 'vitest'
import { cleanName, safeExtension, requireId, validateUpload, validateAvatar, publicConfig, safeAvatar } from '../src/lib/security.js'
import { containsSecret } from '../scripts/scan-secrets.js'

describe('untrusted inputs', () => {
  it('keeps paths out of generated extensions', () => {
    expect(safeExtension('../../something.PDF')).toBe('.pdf')
    expect(safeExtension('x.html/evil')).toBe('')
    expect(safeExtension('x.abcdefghijkl')).toBe('')
  })
  it('rejects invalid folders, control characters and oversize batches before upload', () => {
    expect(() => requireId('../other-user')).toThrow()
    expect(() => cleanName('hello\nthere')).toThrow()
    expect(() => cleanName('  ')).toThrow()
    expect(() => validateUpload({name:'big.zip',size:104857601})).toThrow()
    expect(() => validateUpload({name:'zero.txt',size:0})).not.toThrow()
  })
  it('rejects fake image content and SVG avatars', async () => {
    await expect(validateAvatar(new File(['<svg/>'],'avatar.png',{type:'image/png'}))).rejects.toThrow()
    const file = new File([new Uint8Array([137,80,78,71,13,10,26,10])],'avatar.png',{type:'image/png'})
    await expect(validateAvatar(file)).resolves.toBe('.png')
    expect(safeAvatar('https://tracking.example/pixel','u')).toBe('/avatars/avatar-01.jpeg')
    expect(safeAvatar('storage:someone-else/a.png','u')).toBe('/avatars/avatar-01.jpeg')
  })
  it('rejects privileged keys and insecure production endpoints', () => {
    const admin = `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({role:'service_role'})).replace(/=+$/, '')}.signature`
    expect(() => publicConfig('https://example.supabase.co',admin,true)).toThrow()
    expect(containsSecret(admin)).toBe(true)
    expect(() => publicConfig('http://example.com','sb_publishable_example',true)).toThrow()
    expect(publicConfig('https://example.supabase.co/auth/v1','sb_publishable_example',true).url).toBe('https://example.supabase.co')
  })
})
