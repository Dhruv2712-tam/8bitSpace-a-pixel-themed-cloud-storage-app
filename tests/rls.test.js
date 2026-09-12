import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const folderA = '11111111-1111-4111-8111-111111111111'
const folderB = '22222222-2222-4222-8222-222222222222'
const object = '33333333-3333-4333-8333-333333333333'
const pathA = `${a}/${folderA}/${object}.txt`
let db
beforeAll(async () => {
  db = new PGlite()
  // Minimal Supabase platform schemas. Production application SQL runs unchanged
  // apart from pgcrypto installation (gen_random_uuid is built into Postgres).
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text,name text,owner_id text,metadata jsonb,created_at timestamptz default now());
    create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select,insert,update,delete on storage.objects to anon,authenticated;
    insert into auth.users values('${a}'),('${b}');`)
  await db.exec(fs.readFileSync('supabase/8bitspace-setup.sql','utf8').replace('create extension if not exists pgcrypto;', ''))
  await db.exec(fs.readFileSync('supabase/migrations/20260911094338_security_hardening.sql','utf8'))
  await db.exec(`insert into public.folders(id,user_id,name) values('${folderA}','${a}','A'),('${folderB}','${b}','B');
    insert into storage.objects(bucket_id,name,owner_id,metadata) values('space-files','${pathA}','${a}','{"size":5}');
    insert into public.files(user_id,folder_id,name,storage_path,size_bytes) values('${a}','${folderA}','a.txt','${pathA}',5);`)
})
afterAll(async () => { await db?.close() })
async function asUser(user, query) {
  await db.exec(`begin; set local role ${user ? 'authenticated' : 'anon'}; set local request.jwt.claim.sub = '${user || ''}';`)
  try { return await db.query(query) } finally { await db.exec('rollback') }
}
describe('actual Postgres RLS and security triggers', () => {
  it('shows own rows and hides another user files, folders and objects', async () => {
    expect((await asUser(a,'select * from files')).rows).toHaveLength(1)
    expect((await asUser(b,'select * from files')).rows).toHaveLength(0)
    expect((await asUser(b,'select * from storage.objects')).rows).toHaveLength(0)
    expect((await asUser(b,'select * from folders')).rows).toHaveLength(1)
  })
  it('denies anonymous data access', async () => { await expect(asUser(null,'select * from files')).rejects.toThrow() })
  it('prevents cross-account updates and deletes', async () => {
    expect((await asUser(b,`update files set name='stolen' returning id`)).rows).toHaveLength(0)
    expect((await asUser(b,'delete from files returning id')).rows).toHaveLength(0)
    expect((await asUser(b,'delete from storage.objects returning id')).rows).toHaveLength(0)
  })
  it('rejects forged storage paths and owner reassignment', async () => {
    await expect(asUser(b,`insert into files(user_id,folder_id,name,storage_path,size_bytes) values('${b}','${folderB}','forged','${pathA}',5)`)).rejects.toThrow()
    await expect(asUser(a,`update files set user_id='${b}'`)).rejects.toThrow()
    await expect(asUser(a,`update files set storage_path='${a}/${folderA}/another.txt'`)).rejects.toThrow()
  })
  it('requires a real owned upload with the actual size', async () => {
    await expect(asUser(b,`insert into files(user_id,folder_id,name,storage_path,size_bytes) values('${b}','${folderB}','fake','${b}/${folderB}/${object}.txt',5)`)).rejects.toThrow()
    await expect(asUser(a,`insert into files(user_id,folder_id,name,storage_path,size_bytes) values('${a}','${folderA}','wrong size','${pathA}',500)`)).rejects.toThrow()
  })
  it('permits own upload, rejects another user path, missing or trashed folder', async () => {
    expect((await asUser(b,`insert into storage.objects(bucket_id,name,owner_id) values('space-files','${b}/${folderB}/${object}.txt','${b}') returning id`)).rows).toHaveLength(1)
    await expect(asUser(b,`insert into storage.objects(bucket_id,name,owner_id) values('space-files','${pathA}','${b}')`)).rejects.toThrow()
    await expect(asUser(b,`insert into storage.objects(bucket_id,name,owner_id) values('space-files','${b}/${folderA}/${object}.txt','${b}')`)).rejects.toThrow()
  })
  it('blocks browser overwrites and arbitrary remote avatars', async () => {
    expect((await asUser(a,`update storage.objects set name='overwrite' returning id`)).rows).toHaveLength(0)
    await expect(asUser(b,`insert into profiles(id,avatar_url) values('${b}','https://evil.example/tracker')`)).rejects.toThrow()
  })
  it('enforces upload and metadata rate limits in the database', async () => {
    await db.exec(`insert into private.request_windows values('${b}','uploads',now(),30),('${b}','metadata',now(),300)`)
    await expect(asUser(b,`insert into storage.objects(bucket_id,name,owner_id) values('space-files','${b}/${folderB}/${object}.txt','${b}')`)).rejects.toThrow('Too many requests')
    await expect(asUser(b,`insert into folders(user_id,name) values('${b}','spam')`)).rejects.toThrow('Too many requests')
    await db.exec('delete from private.request_windows')
  })
  it('does not expose privileged helpers to clients', async () => {
    await expect(asUser(a,`select public.consume_delete_attempt('${b}')`)).rejects.toThrow()
    await expect(asUser(a,`select private.consume_request('metadata',999999)`)).rejects.toThrow()
  })
})
