export const DELETE_INTENT_KEY = '8bitspace-delete-intent'
export const DELETE_VERIFICATION_SECONDS = 300

export function deletionProviders(user) {
  return ['google', 'github'].filter(provider => user?.identities?.some(identity => identity.provider === provider))
}

// Only call with claims returned by auth.getClaims(), never a decoded/unverified JWT.
export function hasRecentOAuth(claims, userId, now = Math.floor(Date.now() / 1000), since = now - DELETE_VERIFICATION_SECONDS) {
  return claims?.sub === userId && claims?.is_anonymous === false &&
    Array.isArray(claims.amr) && claims.amr.some(entry =>
      entry?.method === 'oauth' && Number.isInteger(entry.timestamp) &&
      entry.timestamp <= now && entry.timestamp >= Math.max(since, now - DELETE_VERIFICATION_SECONDS))
}

export function readDeletionIntent(storage, now = Date.now()) {
  const raw = storage.getItem(DELETE_INTENT_KEY)
  storage.removeItem(DELETE_INTENT_KEY)
  try {
    const intent = JSON.parse(raw)
    if (typeof intent?.userId !== 'string' || !Number.isFinite(intent.startedAt) ||
        intent.startedAt > now || now - intent.startedAt > DELETE_VERIFICATION_SECONDS * 1000) return null
    return intent
  } catch { return null }
}
