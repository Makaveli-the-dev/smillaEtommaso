begin;

-- Questa migrazione fallisce se le tabelle esistono già, così uno schema remoto preesistente
-- non viene sovrascritto alla cieca. Verificarlo prima di applicare il file nel progetto Supabase.
create table public.album_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique check (storage_path !~ '(^/|\.\.)'),
  taken_at date not null,
  caption text check (caption is null or length(caption) <= 90),
  position integer not null default 0 check (position >= 0),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

create index photos_taken_at_position_idx on public.photos (taken_at, position, created_at);

create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  spotify_url text not null unique check (
    spotify_url ~ '^https://open\.spotify\.com/(intl-[a-z]{2}/)?playlist/[A-Za-z0-9]+([?].*)?$'
    or spotify_url ~ '^spotify:playlist:[A-Za-z0-9]+$'
  ),
  spotify_id text not null unique,
  title text check (title is null or length(title) <= 120),
  added_at timestamptz not null default now(),
  added_by uuid not null default auth.uid() references auth.users (id),
  position integer not null default 0 check (position >= 0)
);

create index playlists_position_added_idx on public.playlists (position, added_at);

create table public.site_settings (
  id text primary key check (id = 'global'),
  main_playlist_id uuid references public.playlists (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

insert into public.site_settings (id) values ('global');

-- Elenco compilato manualmente dalla dashboard dopo aver creato gli account Supabase Auth autorizzati.
-- Non esistono policy di scrittura client per questa tabella: solo l'amministratore del progetto può aggiungere membri.
alter table public.album_members enable row level security;
alter table public.photos enable row level security;
alter table public.playlists enable row level security;
alter table public.site_settings enable row level security;

create or replace function public.is_album_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.album_members as member
    where member.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_album_member() from public;
grant execute on function public.is_album_member() to anon, authenticated;

revoke all on table public.album_members, public.photos, public.playlists, public.site_settings from anon, public;
grant select on table public.album_members to authenticated;
grant select, insert, delete on table public.photos to authenticated;
grant select, insert, update, delete on table public.playlists to authenticated;
grant select, update on table public.site_settings to authenticated;

create policy album_members_read_self on public.album_members
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy photos_read_members on public.photos
  for select to authenticated
  using ((select public.is_album_member()));

create policy photos_insert_members on public.photos
  for insert to authenticated
  with check (
    (select public.is_album_member())
    and created_by = (select auth.uid())
  );

create policy photos_delete_members on public.photos
  for delete to authenticated
  using ((select public.is_album_member()));

create policy playlists_read_members on public.playlists
  for select to authenticated
  using ((select public.is_album_member()));

create policy playlists_insert_members on public.playlists
  for insert to authenticated
  with check (
    (select public.is_album_member())
    and added_by = (select auth.uid())
  );

create policy playlists_update_members on public.playlists
  for update to authenticated
  using ((select public.is_album_member()))
  with check ((select public.is_album_member()));

create policy playlists_delete_members on public.playlists
  for delete to authenticated
  using ((select public.is_album_member()));

create policy site_settings_read_members on public.site_settings
  for select to authenticated
  using ((select public.is_album_member()));

create policy site_settings_update_members on public.site_settings
  for update to authenticated
  using ((select public.is_album_member()))
  with check ((select public.is_album_member()));

-- Mantiene privato il bucket già creato e imposta limiti compatibili con la conversione a WebP nel browser.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('album', 'album', false, 12582912, array['image/webp']::text[])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- La policy restrittiva protegge il bucket album anche se esistono policy permissive più ampie.
create policy album_private_member_guard on storage.objects
  as restrictive
  for all to public
  using (bucket_id <> 'album' or (select public.is_album_member()))
  with check (bucket_id <> 'album' or (select public.is_album_member()));

create policy album_private_member_read on storage.objects
  for select to authenticated
  using (bucket_id = 'album' and (select public.is_album_member()));

create policy album_private_member_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'album' and (select public.is_album_member()));

create policy album_private_member_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'album' and (select public.is_album_member()));

commit;
