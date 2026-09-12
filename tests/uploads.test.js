import { beforeEach, it, expect, vi } from 'vitest'
const mocks = vi.hoisted(()=>({upload:vi.fn(),remove:vi.fn(),insert:vi.fn(),signed:vi.fn()}))
vi.mock('../src/lib/supabase',()=>({supabase:{storage:{from:()=>({upload:mocks.upload,remove:mocks.remove,createSignedUrl:mocks.signed})},from:()=>({insert:mocks.insert})},supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'public'}))
import { uploadCloudFiles, signedFileUrl } from '../src/lib/cloud.js'
const user={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},folder='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
beforeEach(()=>{vi.resetAllMocks();mocks.upload.mockResolvedValue({data:{},error:null});mocks.remove.mockResolvedValue({error:null});mocks.insert.mockResolvedValue({error:null})})
it('validates the whole batch before uploading anything',async()=>{
 await expect(uploadCloudFiles(user,folder,[{name:'ok',size:1},{name:'huge',size:104857601}])).rejects.toThrow()
 expect(mocks.upload).not.toHaveBeenCalled()
})
it('cleans up an object when metadata insertion fails',async()=>{
 mocks.insert.mockResolvedValue({error:new Error('database rejected')})
 await expect(uploadCloudFiles(user,folder,[{name:'safe.pdf',size:1,type:'application/pdf'}])).rejects.toThrow('database rejected')
 expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0][0]])
})
it('reports cleanup failure instead of claiming rollback succeeded',async()=>{
 mocks.insert.mockResolvedValue({error:new Error('database rejected')});mocks.remove.mockResolvedValue({error:new Error('storage unavailable')})
 await expect(uploadCloudFiles(user,folder,[{name:'safe.pdf',size:1,type:'application/pdf'}])).rejects.toThrow('cleaned up')
})
it('does not write metadata after a failed upload',async()=>{
 mocks.upload.mockResolvedValue({error:new Error('upload failed')})
 await expect(uploadCloudFiles(user,folder,[{name:'safe',size:1}])).rejects.toThrow('upload failed')
 expect(mocks.insert).not.toHaveBeenCalled()
})
it('forces downloads for shared arbitrary files and bounds link lifetime',async()=>{
 mocks.signed.mockResolvedValue({data:{signedUrl:'https://example/file'},error:null})
 await signedFileUrl({storagePath:'path',name:'untrusted.html'},300)
 expect(mocks.signed).toHaveBeenCalledWith('path',300,{download:'untrusted.html'})
 await expect(signedFileUrl({storagePath:'path',name:'a'},86400)).rejects.toThrow()
})
