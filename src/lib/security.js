export const MAX_FILE_BYTES = 100 * 1024 * 1024
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function requireId(value) {
  if (!UUID.test(value || '')) throw new Error('A valid account and folder are required.')
  return value
}

export function cleanName(value, maxLength = 255) {
  const name = String(value || '').normalize('NFKC').trim()
  if (!name || name.length > maxLength || /[\x00-\x1f\x7f]/.test(name)) {
    throw new Error(`Use a name between 1 and ${maxLength} characters without control characters.`)
  }
  return name
}

export const safeExtension = name => {
  const match = name.normalize('NFKC').toLowerCase().match(/\.([a-z0-9]{1,10})$/)
  return match ? `.${match[1]}` : ''
}

export function validateUpload(file) {
  cleanName(file.name)
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES) {
    throw new Error('Each file must be 100 MB or smaller.')
  }
}

export async function validateAvatar(file) {
  if (!file.size || file.size > MAX_AVATAR_BYTES) throw new Error('Choose an image up to 5 MB.')
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const png = [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  const webp = String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP'
  const type = png ? 'image/png' : jpeg ? 'image/jpeg' : webp ? 'image/webp' : null
  if (!type || file.type !== type) throw new Error('Choose a valid PNG, JPEG, or WebP image.')
  return type === 'image/jpeg' ? '.jpg' : type === 'image/png' ? '.png' : '.webp'
}

export function safeAvatar(value, userId) {
  if (/^\/avatars\/avatar-(0[1-9]|1[0-2])\.(jpeg|png)$/.test(value || '')) return value
  if (value?.startsWith(`storage:${userId}/`) && !value.includes('..')) return value
  return '/avatars/avatar-01.jpeg'
}

export function publicConfig(rawUrl, rawKey, production = false) {
  const clean = value => value?.trim().replace(/^['"]|['"]$/g, '') || ''
  const key = clean(rawKey)
  let url
  try { url = new URL(clean(rawUrl)) } catch { throw new Error('Set a valid Supabase project URL.') }
  if (url.username || url.password || (url.protocol !== 'https:' && !( !production && url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname)))) {
    throw new Error('Supabase must use HTTPS in production.')
  }
  let anon = false
  try { anon = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon' } catch { /* A publishable key is not a JWT. */ }
  if (!key.startsWith('sb_publishable_') && !anon) throw new Error('Use a publishable key, never an administrator or secret key.')
  return { url: url.origin, key }
}
