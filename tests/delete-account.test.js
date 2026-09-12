import { it, expect, vi } from 'vitest'
import { createDeleteHandler, removeOwnedObjects } from '../supabase/functions/delete-account/handler.js'
const origin = 'https://app.example'
const req = (opts={}) => new Request('https://function.example', { method:'POST',headers:{origin,'content-type':'application/json',authorization:'Bearer test-token',...opts.headers},body:JSON.stringify({password:'correct-password',...opts.body}) })
const env = key => ({ALLOWED_ORIGINS:origin,SUPABASE_URL:'https://db.example',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'secret'}[key])
function clients({passwordError=false, limit=true}={}) {
  const remove = vi.fn().mockResolvedValue({error:null})
  const list = vi.fn().mockResolvedValue({data:[],error:null})
  const admin = {rpc:vi.fn().mockResolvedValue({data:limit,error:null}),storage:{from:()=>({list,remove})},auth:{admin:{signOut:vi.fn().mockResolvedValue({error:null}),deleteUser:vi.fn().mockResolvedValue({error:null})}}}
  const user = {id:'user-a',email:'a@example.com'}
  const createClient = vi.fn().mockReturnValueOnce({auth:{getUser:async()=>({data:{user},error:null})}}).mockReturnValueOnce(admin).mockReturnValueOnce({auth:{signInWithPassword:async()=>({data:{user},error:passwordError}),signOut:vi.fn().mockResolvedValue({error:null})}})
  return {createClient,admin,remove,list}
}
it('denies untrusted origins and missing authentication before any client is created', async () => {
  const createClient = vi.fn(), handler=createDeleteHandler({createClient,env})
  expect((await handler(req({headers:{origin:'https://evil.example'}}))).status).toBe(403)
  expect((await handler(req({headers:{authorization:''}}))).status).toBe(401)
  expect(createClient).not.toHaveBeenCalled()
})
it('requires password verification and rate limiting before deletion', async () => {
  const c=clients({passwordError:true})
  expect((await createDeleteHandler({...c,env})(req())).status).toBe(401)
  expect(c.admin.auth.admin.deleteUser).not.toHaveBeenCalled()
  expect(c.list).not.toHaveBeenCalled()
  const limited=clients({limit:false})
  expect((await createDeleteHandler({...limited,env})(req())).status).toBe(429)
  expect(limited.admin.auth.admin.deleteUser).not.toHaveBeenCalled()
})
it('deletes only the verified account and revokes sessions', async () => {
  const c=clients()
  const response=await createDeleteHandler({...c,env})(req({body:{userId:'victim'}}))
  expect(response.status).toBe(200)
  expect(c.list.mock.calls.every(([prefix])=>prefix==='user-a')).toBe(true)
  expect(c.admin.auth.admin.deleteUser).toHaveBeenCalledWith('user-a')
  expect(c.admin.auth.admin.signOut).toHaveBeenCalledWith('test-token','global')
  expect(response.headers.get('cache-control')).toBe('no-store')
})
it('fails closed on listing errors and traversal names', async () => {
  const c=clients()
  c.list.mockResolvedValueOnce({data:null,error:new Error('internal detail')})
  const response=await createDeleteHandler({...c,env})(req())
  expect(response.status).toBe(500)
  expect(await response.text()).not.toContain('internal detail')
  expect(c.admin.auth.admin.deleteUser).not.toHaveBeenCalled()
  const storage={from:()=>({list:async()=>({data:[{id:'x',name:'../victim'}],error:null}),remove:c.remove})}
  await expect(removeOwnedObjects(storage,'space-files','user-a')).rejects.toThrow()
  expect(c.remove).not.toHaveBeenCalled()
})
it('paginates all objects before deleting, avoiding skipped pages', async () => {
  const remove=vi.fn().mockResolvedValue({error:null})
  const list=vi.fn().mockResolvedValueOnce({data:Array.from({length:100},(_,i)=>({id:String(i),name:`file-${i}`})),error:null}).mockResolvedValueOnce({data:[{id:'last',name:'last'}],error:null})
  await removeOwnedObjects({from:()=>({list,remove})},'space-files','user-a')
  expect(list.mock.calls[1][1].offset).toBe(100)
  expect(remove.mock.calls.flat(2)).toHaveLength(101)
  expect(remove.mock.calls.flat(2).every(path=>path.startsWith('user-a/'))).toBe(true)
})
