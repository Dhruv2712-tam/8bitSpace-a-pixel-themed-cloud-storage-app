-- Apply AFTER 8bitspace-setup.sql. Existing rows are preserved; new writes are validated.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists private.request_windows (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key(user_id, action)
);
revoke all on private.request_windows from public, anon, authenticated;
alter table private.request_windows enable row level security;

-- Only server-owned triggers and authenticated account-scoped checks use this helper.
create or replace function private.consume_request(action_name text, max_hits integer)
returns void language plpgsql security definer set search_path = '' as $$
declare total integer; actor uuid := auth.uid();
begin
  if actor is null or not exists (select 1 from auth.users where id = actor) then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  insert into private.request_windows(user_id, action, window_start, hits)
  values(actor, action_name, clock_timestamp(), 1)
  on conflict (user_id, action) do update set
    hits = case when private.request_windows.window_start < clock_timestamp() - interval '1 minute' then 1 else private.request_windows.hits + 1 end,
    window_start = case when private.request_windows.window_start < clock_timestamp() - interval '1 minute' then clock_timestamp() else private.request_windows.window_start end
  returning hits into total;
  if total > max_hits then raise exception 'Too many requests. Try again in a minute.' using errcode = 'P0001'; end if;
end;
$$;
revoke all on function private.consume_request(text, integer) from public, anon, authenticated;

create or replace function private.guard_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  -- Administrative maintenance uses service_role/postgres, with no user JWT.
  if actor is not null then
    if (to_jsonb(new)->>case when tg_table_name = 'profiles' then 'id' else 'user_id' end)::uuid <> actor then
      raise exception 'Owner mismatch' using errcode = '42501';
    end if;
    perform private.consume_request('metadata', 300);
  end if;
  if tg_table_name = 'files' then
    if new.storage_path not like new.user_id::text || '/' || new.folder_id::text || '/%'
       or new.storage_path ~ '(^|/)\.\.?(/|$)' then
      raise exception 'File path must belong to its owner and folder' using errcode = '23514';
    end if;
    if tg_op = 'INSERT' and not exists (
      select 1 from storage.objects where bucket_id = 'space-files'
        and name = new.storage_path and owner_id = new.user_id::text
        and (metadata->>'size')::bigint = new.size_bytes
    ) then raise exception 'Upload the owned file before saving its metadata' using errcode = '23514'; end if;
    if tg_op = 'UPDATE' and (new.user_id, new.folder_id, new.storage_path, new.size_bytes, new.mime_type)
      is distinct from (old.user_id, old.folder_id, old.storage_path, old.size_bytes, old.mime_type) then
      raise exception 'Stored file identity cannot be changed' using errcode = '23514';
    end if;
  elsif tg_table_name = 'folders' then
    if tg_op = 'UPDATE' and (new.user_id, new.parent_id) is distinct from (old.user_id, old.parent_id) then
      raise exception 'Folder owner and parent cannot be changed' using errcode = '23514';
    end if;
    if new.parent_id = new.id then raise exception 'A folder cannot contain itself' using errcode = '23514'; end if;
  elsif tg_table_name = 'profiles' then
    if new.avatar_url is not null and new.avatar_url !~ '^/avatars/avatar-(0[1-9]|1[0-2])\.(jpeg|png)$'
      and not (new.avatar_url like 'storage:' || new.id::text || '/%' and new.avatar_url !~ '\.\.') then
      raise exception 'Invalid avatar location' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_write() from public, anon, authenticated;
create trigger security_guard_files before insert or update on public.files for each row execute function private.guard_write();
create trigger security_guard_folders before insert or update on public.folders for each row execute function private.guard_write();
create trigger security_guard_profiles before insert or update on public.profiles for each row execute function private.guard_write();
create trigger security_guard_activity before insert on public.activity for each row execute function private.guard_write();

alter table public.files add constraint files_size_limit check (size_bytes <= 104857600) not valid;
alter table public.files add constraint files_name_safe check (btrim(name) <> '' and name !~ '[[:cntrl:]]') not valid;
alter table public.folders add constraint folders_name_safe check (btrim(name) <> '' and name !~ '[[:cntrl:]]') not valid;
alter table public.profiles add constraint profiles_name_safe check (btrim(display_name) <> '' and display_name !~ '[[:cntrl:]]') not valid;

-- A distinct object is counted once, even when Storage evaluates a policy repeatedly.
create table private.upload_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null, path text not null, created_at timestamptz not null default now(),
  primary key(user_id, bucket, path)
);
revoke all on private.upload_attempts from public, anon, authenticated;
alter table private.upload_attempts enable row level security;
create or replace function private.allow_upload(bucket text, path text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); added integer;
begin
  if actor is null or not exists(select 1 from auth.users where id = actor) then return false; end if;
  if bucket = 'space-files' then
    if path !~ ('^' || actor::text || '/[0-9a-f-]{36}/[0-9a-f-]{36}(\.[a-z0-9]{1,10})?$') then return false; end if;
    if not exists(select 1 from public.folders where id::text = split_part(path,'/',2) and user_id = actor and trashed_at is null) then return false; end if;
  elsif bucket = 'profile-avatars' then
    if path !~ ('^' || actor::text || '/[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$') then return false; end if;
  else return false;
  end if;
  insert into private.upload_attempts(user_id,bucket,path) values(actor,bucket,path) on conflict do nothing;
  get diagnostics added = row_count;
  if added > 0 then perform private.consume_request('uploads',30); end if;
  delete from private.upload_attempts where user_id = actor and created_at < now() - interval '1 day';
  return true;
end;
$$;
revoke all on function private.allow_upload(text,text) from public, anon;
grant execute on function private.allow_upload(text,text) to authenticated;

drop policy space_files_insert_own on storage.objects;
create policy space_files_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'space-files' and private.allow_upload(bucket_id,name));
drop policy profile_avatars_insert_own on storage.objects;
create policy profile_avatars_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'profile-avatars' and private.allow_upload(bucket_id,name));
-- The app only creates unique objects. Disable replacement/move API access.
drop policy space_files_update_own on storage.objects;
drop policy profile_avatars_update_own on storage.objects;

-- Service-only deletion throttling: the endpoint supplies the verified user's ID.
create or replace function public.consume_delete_attempt(actor uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare total integer;
begin
  if not exists(select 1 from auth.users where id=actor) then return false; end if;
  insert into private.request_windows values(actor,'delete-account',clock_timestamp(),1)
  on conflict(user_id,action) do update set
    hits = case when private.request_windows.window_start < clock_timestamp()-interval '1 minute' then 1 else private.request_windows.hits+1 end,
    window_start = case when private.request_windows.window_start < clock_timestamp()-interval '1 minute' then clock_timestamp() else private.request_windows.window_start end
  returning hits into total;
  return total <= 5;
end;
$$;
revoke all on function public.consume_delete_attempt(uuid) from public, anon, authenticated;
grant execute on function public.consume_delete_attempt(uuid) to service_role;
