export function corsHeaders(request, origins) {
  const origin = request.headers.get('origin')
  if (!origin || !origins.includes(origin)) return null
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
}

async function readBody(request) {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Missing body')
  let size = 0, text = ''
  const decoder = new TextDecoder()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 4096) { await reader.cancel(); throw new Error('Body too large') }
    text += decoder.decode(value, { stream: true })
  }
  return JSON.parse(text + decoder.decode())
}

// Enumerate storage, never trust editable public.files paths with an admin client.
export async function removeOwnedObjects(storage, bucket, userId) {
  const client = storage.from(bucket)
  async function visit(prefix, depth = 0) {
    if (!prefix.startsWith(`${userId}/`) || prefix.includes('..') || depth > 8) throw new Error('Invalid storage path')
    const paths = [], folders = []
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await client.list(prefix.slice(0, -1), { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } })
      if (error || !data) throw new Error('Could not list stored objects')
      for (const item of data) {
        if (!item.name || item.name.includes('/') || item.name.includes('..')) throw new Error('Invalid object name')
        const path = `${prefix}${item.name}`
        if (item.id) paths.push(path)
        else folders.push(`${path}/`)
      }
      if (data.length < 100) break
    }
    for (const folder of folders) await visit(folder, depth + 1)
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await client.remove(paths.slice(i, i + 100))
      if (error) throw new Error('Could not remove stored objects')
    }
  }
  await visit(`${userId}/`)
}

export function createDeleteHandler({ createClient, env }) {
  return async request => {
    const headers = corsHeaders(request, (env('ALLOWED_ORIGINS') || '').split(',').map(v => v.trim()).filter(Boolean))
    if (!headers) return Response.json({ error: 'Origin not allowed' }, { status: 403 })
    const reply = (body, status = 200) => Response.json(body, { status, headers })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405)
    const authorization = request.headers.get('authorization') || ''
    if (!/^Bearer \S+$/i.test(authorization)) return reply({ error: 'Authentication required' }, 401)
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'JSON required' }, 415)
    try {
      let body
      try { body = await readBody(request) } catch { return reply({ error: 'Invalid request body' }, 400) }
      if (body?.confirmation !== 'DELETE ACCOUNT') return reply({ error: 'Type DELETE ACCOUNT to confirm' }, 400)
      const oauth = body.verification === 'oauth'
      if (!oauth && (typeof body?.password !== 'string' || !body.password || body.password.length > 1024)) return reply({ error: 'Current password required' }, 400)
      const url = env('SUPABASE_URL'), anon = env('SUPABASE_ANON_KEY'), secret = env('SUPABASE_SERVICE_ROLE_KEY')
      if (!url || !anon || !secret) return reply({ error: 'Service unavailable' }, 503)
      const options = { auth: { persistSession: false, autoRefreshToken: false } }
      const userClient = createClient(url, anon, { ...options, global: { headers: { Authorization: authorization } } })
      const { data: { user }, error } = await userClient.auth.getUser()
      if (error || !user?.email) return reply({ error: 'Invalid session' }, 401)
      if (oauth && body.expectedUserId !== user.id) return reply({ error: 'Your account changed. Close this dialog and try again.' }, 401)
      const admin = createClient(url, secret, options)
      const limit = await admin.rpc('consume_delete_attempt', { actor: user.id })
      if (limit.error) return reply({ error: 'Service unavailable' }, 503)
      if (!limit.data) return reply({ error: 'Too many attempts. Try again in a minute.' }, 429)
      if (oauth) {
        const { data, error: claimsError } = await userClient.auth.getClaims(authorization.slice(7))
        const claims = data?.claims
        const now = Math.floor(Date.now() / 1000)
        // Use the signed authentication event, not iat/last_sign_in_at: refreshing
        // an old session must never count as a fresh provider sign-in.
        const recentOAuth = !claimsError && claims?.sub === user.id && claims?.is_anonymous === false &&
          Array.isArray(claims.amr) && claims.amr.some(entry => entry?.method === 'oauth' &&
            Number.isInteger(entry.timestamp) && entry.timestamp <= now && entry.timestamp >= now - 300)
        const socialIdentity = user.identities?.some(identity => ['google', 'github'].includes(identity.provider))
        if (!recentOAuth || !socialIdentity) return reply({ error: 'Please verify with Google or GitHub again, then confirm deletion.' }, 401)
      } else {
        const verifier = createClient(url, anon, options)
        const verified = await verifier.auth.signInWithPassword({ email: user.email, password: body.password })
        // Clean up even when verification returned a different account.
        if (verified.data?.session) await verifier.auth.signOut({ scope: 'local' })
        if (verified.error || verified.data.user?.id !== user.id) return reply({ error: 'Password verification failed' }, 401)
      }
      await removeOwnedObjects(admin.storage, 'space-files', user.id)
      await removeOwnedObjects(admin.storage, 'profile-avatars', user.id)
      const revoked = await admin.auth.admin.signOut(authorization.slice(7), 'global')
      if (revoked.error) throw new Error('Session revocation failed')
      const deleted = await admin.auth.admin.deleteUser(user.id)
      if (deleted.error) throw new Error('Account deletion failed')
      return reply({ deleted: true })
    } catch { return reply({ error: 'Account deletion could not finish. Please retry or contact support.' }, 500) }
  }
}
