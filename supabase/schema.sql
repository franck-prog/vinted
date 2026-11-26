-- Suivi Vinted — base de synchronisation (Supabase)
-- À coller dans « SQL Editor » puis « Run ». Le script peut être relancé sans risque.

-- 1. Une ligne par article ou dépense, propre à chaque utilisateur
create table if not exists public.vinted_items (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  kind       text        not null check (kind in ('article', 'depense')),
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null,
  deleted    boolean     not null default false,
  primary key (user_id, id)
);

-- 2. Chacun ne voit et ne modifie que ses propres lignes
alter table public.vinted_items enable row level security;

drop policy if exists "vinted_items: lecture perso" on public.vinted_items;
drop policy if exists "vinted_items: ajout perso" on public.vinted_items;
drop policy if exists "vinted_items: modification perso" on public.vinted_items;
drop policy if exists "vinted_items: suppression perso" on public.vinted_items;

create policy "vinted_items: lecture perso" on public.vinted_items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "vinted_items: ajout perso" on public.vinted_items
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "vinted_items: modification perso" on public.vinted_items
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "vinted_items: suppression perso" on public.vinted_items
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.vinted_items from anon;
grant select, insert, update, delete on public.vinted_items to authenticated;

-- 3. Stockage des photos (privé, 5 Mo max par fichier, JPEG uniquement)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];

-- Chaque utilisateur n'a accès qu'à son dossier : photos/<son identifiant>/...
drop policy if exists "photos: lecture perso" on storage.objects;
drop policy if exists "photos: ajout perso" on storage.objects;
drop policy if exists "photos: modification perso" on storage.objects;
drop policy if exists "photos: suppression perso" on storage.objects;

create policy "photos: lecture perso" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos: ajout perso" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos: modification perso" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos: suppression perso" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
