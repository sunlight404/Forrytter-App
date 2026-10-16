-- Hearts are explicit acknowledgements, not automatic read receipts.
create table public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  community_message_id uuid references public.community_messages(id) on delete cascade,
  direct_message_id uuid references public.direct_messages(id) on delete cascade,
  board_message_id uuid references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint message_reactions_one_target check (num_nonnulls(community_message_id,direct_message_id,board_message_id)=1),
  unique (community_message_id,user_id),
  unique (direct_message_id,user_id),
  unique (board_message_id,user_id)
);
create index message_reactions_user_idx on public.message_reactions(user_id);
alter table public.message_reactions enable row level security;
revoke all on public.message_reactions from public,anon,authenticated;
grant select,delete on public.message_reactions to authenticated;
grant insert(community_message_id,direct_message_id,board_message_id,user_id) on public.message_reactions to authenticated;

-- These parent lookups run as the caller and inherit the parent's RLS.
-- In particular, private reactions have no administrator bypass.
create policy "read hearts on accessible messages" on public.message_reactions
  for select to authenticated using (
    exists(select 1 from public.community_messages m where m.id=community_message_id)
    or exists(select 1 from public.direct_messages m where m.id=direct_message_id)
    or exists(select 1 from public.messages m where m.id=board_message_id)
  );
create policy "add own heart to accessible message" on public.message_reactions
  for insert to authenticated with check (
    user_id=(select auth.uid()) and (
      exists(select 1 from public.community_messages m where m.id=community_message_id)
      or exists(select 1 from public.direct_messages m where m.id=direct_message_id)
      or exists(select 1 from public.messages m where m.id=board_message_id)
    )
  );
create policy "remove own heart from accessible message" on public.message_reactions
  for delete to authenticated using (
    user_id=(select auth.uid()) and (
      exists(select 1 from public.community_messages m where m.id=community_message_id)
      or exists(select 1 from public.direct_messages m where m.id=direct_message_id)
      or exists(select 1 from public.messages m where m.id=board_message_id)
    )
  );
comment on table public.message_reactions is 'Explicit heart acknowledgements. One per person/message. Visibility follows the original message; no TV or push integration.';
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='message_reactions') then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;
