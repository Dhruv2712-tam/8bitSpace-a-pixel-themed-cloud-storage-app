export const DELETE_INTENT_KEY = '8bitspace-delete-intent'
export const DELETE_VERIFICATION_SECONDS = 300

export function deletionProviders(user) {
  return ['google', 'github'].filter(provider => user?.identities?.some(identity => identity.provider === provider))
}

// Only call with claims returned by auth.getClaims(), never a decoded/unverified JWT.
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
