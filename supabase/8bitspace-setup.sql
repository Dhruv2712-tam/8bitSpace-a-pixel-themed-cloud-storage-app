-- 8bitSpace Supabase schema
-- Run this entire file once in the Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Player' check (char_length(display_name) between 1 and 80),
  avatar_url text,
  notifications boolean not null default true,
  theme text not null default 'pixel-night' check (theme in ('pixel-night', 'pixel-day')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid,
  name text not null check (char_length(name) between 1 and 120),
  is_starred boolean not null default false,
  trashed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint folders_parent_owned_fk
    foreign key (parent_id, user_id)
    references public.folders(id, user_id)
    on delete cascade
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid not null,
  name text not null check (char_length(name) between 1 and 255),
  storage_path text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  tag text,
  is_starred boolean not null default false,
  trashed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, storage_path),
  constraint files_folder_owned_fk
    foreign key (folder_id, user_id)
    references public.folders(id, user_id)
    on delete cascade
);

create table if not exists public.activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (char_length(action) between 1 and 80),
  subject text not null check (char_length(subject) between 1 and 255),
  created_at timestamptz not null default now()
);

create index if not exists folders_user_parent_idx
  on public.folders (user_id, parent_id, updated_at desc)
  where trashed_at is null;
create index if not exists folders_parent_owned_fk_idx
  on public.folders (parent_id, user_id);
create index if not exists folders_user_trash_idx
  on public.folders (user_id, trashed_at)
  where trashed_at is not null;
create index if not exists files_user_folder_idx
  on public.files (user_id, folder_id, updated_at desc)
  where trashed_at is null;
create index if not exists files_folder_owned_fk_idx
  on public.files (folder_id, user_id);
create index if not exists files_user_starred_idx
  on public.files (user_id, updated_at desc)
  where is_starred and trashed_at is null;
create index if not exists files_user_trash_idx
  on public.files (user_id, trashed_at)
  where trashed_at is not null;
create index if not exists activity_user_created_idx
  on public.activity (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists folders_set_updated_at on public.folders;
create trigger folders_set_updated_at before update on public.folders
for each row execute function public.set_updated_at();
drop trigger if exists files_set_updated_at on public.files;
create trigger files_set_updated_at before update on public.files
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.folders enable row level security;
alter table public.files enable row level security;
alter table public.activity enable row level security;

revoke all on public.profiles, public.folders, public.files, public.activity from anon;
grant select, insert, update, delete on public.profiles, public.folders, public.files, public.activity to authenticated;
grant select, insert, update, delete on public.profiles, public.folders, public.files, public.activity to service_role;
grant usage, select on sequence public.activity_id_seq to authenticated;
grant usage, select on sequence public.activity_id_seq to service_role;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated
using ((select auth.uid()) = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles for delete to authenticated
using ((select auth.uid()) = id);

drop policy if exists "folders_select_own" on public.folders;
create policy "folders_select_own" on public.folders for select to authenticated
using ((select auth.uid()) = user_id);
drop policy if exists "folders_insert_own" on public.folders;
create policy "folders_insert_own" on public.folders for insert to authenticated
with check ((select auth.uid()) = user_id);
drop policy if exists "folders_update_own" on public.folders;
create policy "folders_update_own" on public.folders for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
drop policy if exists "folders_delete_own" on public.folders;
create policy "folders_delete_own" on public.folders for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "files_select_own" on public.files;
create policy "files_select_own" on public.files for select to authenticated
using ((select auth.uid()) = user_id);
drop policy if exists "files_insert_own" on public.files;
create policy "files_insert_own" on public.files for insert to authenticated
with check ((select auth.uid()) = user_id);
drop policy if exists "files_update_own" on public.files;
create policy "files_update_own" on public.files for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
drop policy if exists "files_delete_own" on public.files;
create policy "files_delete_own" on public.files for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "activity_select_own" on public.activity;
create policy "activity_select_own" on public.activity for select to authenticated
using ((select auth.uid()) = user_id);
drop policy if exists "activity_insert_own" on public.activity;
create policy "activity_insert_own" on public.activity for insert to authenticated
with check ((select auth.uid()) = user_id);
drop policy if exists "activity_delete_own" on public.activity;
create policy "activity_delete_own" on public.activity for delete to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('space-files', 'space-files', false, 104857600)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "space_files_select_own" on storage.objects;
create policy "space_files_select_own" on storage.objects for select to authenticated
using (
  bucket_id = 'space-files'
  and owner_id = (select auth.uid())::text
);

drop policy if exists "space_files_insert_own" on storage.objects;
create policy "space_files_insert_own" on storage.objects for insert to authenticated
with check (
  bucket_id = 'space-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "space_files_update_own" on storage.objects;
create policy "space_files_update_own" on storage.objects for update to authenticated
using (
  bucket_id = 'space-files'
  and owner_id = (select auth.uid())::text
)
with check (
  bucket_id = 'space-files'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "space_files_delete_own" on storage.objects;
create policy "space_files_delete_own" on storage.objects for delete to authenticated
using (
  bucket_id = 'space-files'
  and owner_id = (select auth.uid())::text
);
