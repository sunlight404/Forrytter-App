-- Fellesprat is independent of public.messages and get_tv_messages().
create table public.community_messages (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid not null references public.stables(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000 and body ~ '[^[:space:]]'),
  created_at timestamptz not null default now()
);
create index community_messages_stable_created_idx on public.community_messages(stable_id, created_at desc, id desc);
create index community_messages_sender_idx on public.community_messages(sender_id);
alter table public.community_messages enable row level security;
revoke all on public.community_messages from public, anon, authenticated;
grant select, delete on public.community_messages to authenticated;
grant insert (id, stable_id, sender_id, body) on public.community_messages to authenticated;
create policy "active members read community chat" on public.community_messages
  for select to authenticated using (public.is_member(stable_id));
create policy "active members send as themselves" on public.community_messages
  for insert to authenticated with check (sender_id = (select auth.uid()) and public.is_member(stable_id));
create policy "sender or admin deletes community chat" on public.community_messages
  for delete to authenticated using (public.is_member(stable_id) and (sender_id = (select auth.uid()) or public.is_admin(stable_id)));
comment on table public.community_messages is 'Member conversation in the app only. Not connected to TV messages or TV feeds.';
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='community_messages') then
    alter publication supabase_realtime add table public.community_messages;
  end if;
end $$;

