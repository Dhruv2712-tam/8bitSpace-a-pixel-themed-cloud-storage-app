import { it, expect } from 'vitest'
import { DELETE_INTENT_KEY, deletionProviders, hasRecentOAuth, readDeletionIntent } from '../src/lib/account-deletion.js'

it('offers only linked Google/GitHub identities, including mixed email accounts',()=>{
  expect(deletionProviders({identities:[{provider:'email'},{provider:'github'}]})).toEqual(['github'])
  expect(deletionProviders({user_metadata:{provider:'google'}})).toEqual([])
})
it('accepts only a fresh OAuth event for the original account after the flow started',()=>{
  const claims={sub:'a',is_anonymous:false,amr:[{method:'oauth',timestamp:990}]}
  expect(hasRecentOAuth(claims,'a',1000,980)).toBe(true)
  expect(hasRecentOAuth(claims,'b',1000,980)).toBe(false)
  expect(hasRecentOAuth(claims,'a',1000,995)).toBe(false)
  expect(hasRecentOAuth(claims,'a',1400,980)).toBe(false)
  expect(hasRecentOAuth(claims,'a',900,880)).toBe(false)
  expect(hasRecentOAuth({...claims,amr:[{method:'token_refresh',timestamp:1000}]},'a',1000)).toBe(false)
})
it('consumes deletion intent once and discards malformed, stale, or future requests',()=>{
  for(const value of ['invalid',null,{userId:'a',startedAt:0},{userId:'a',startedAt:1000001},{startedAt:1000000}]) {
    const store=new Map([[DELETE_INTENT_KEY,JSON.stringify(value)]])
    const storage={getItem:key=>store.get(key),removeItem:key=>store.delete(key)}
    expect(readDeletionIntent(storage,1000000)).toBeNull()
    expect(store.size).toBe(0)
  }
  const intent={userId:'a',startedAt:990000}
  const store=new Map([[DELETE_INTENT_KEY,JSON.stringify(intent)]])
  const storage={getItem:key=>store.get(key),removeItem:key=>store.delete(key)}
  expect(readDeletionIntent(storage,1000000)).toEqual(intent)
  expect(readDeletionIntent(storage,1000000)).toBeNull()
})
