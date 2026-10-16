-- Imported board messages remain traceable and can only be marked by the server.
-- No trigger mirrors new chat messages to the board, TV feed, or push queue.
alter table public.community_messages add column board_message_id uuid unique;
comment on column public.community_messages.board_message_id is 'Original board message ID for the one-time history import. Not writable by app clients.';

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid not null references public.stables(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000 and body ~ '[^[:space:]]'),
  created_at timestamptz not null default now(),
  constraint direct_messages_two_people check (sender_id <> recipient_id)
);
create index direct_messages_sender_thread_idx on public.direct_messages(sender_id, stable_id, recipient_id, created_at desc, id desc);
create index direct_messages_recipient_thread_idx on public.direct_messages(recipient_id, stable_id, sender_id, created_at desc, id desc);
create index direct_messages_stable_idx on public.direct_messages(stable_id);
alter table public.direct_messages enable row level security;
revoke all on public.direct_messages from public, anon, authenticated;
grant select, delete on public.direct_messages to authenticated;
grant insert (id, stable_id, sender_id, recipient_id, body) on public.direct_messages to authenticated;

-- There is deliberately no administrator bypass for private conversations.
create policy "participants read their private messages" on public.direct_messages
  for select to authenticated using (
    public.is_member(stable_id)
    and ((select auth.uid()) = sender_id or (select auth.uid()) = recipient_id)
  );
create policy "members send private messages as themselves" on public.direct_messages
  for insert to authenticated with check (
    sender_id = (select auth.uid())
    and public.is_member(stable_id)
    and recipient_id <> sender_id
    and exists (
      select 1 from public.memberships recipient
      where recipient.stable_id = direct_messages.stable_id
        and recipient.user_id = direct_messages.recipient_id
        and recipient.active and not recipient.archived
    )
  );
create policy "senders delete their own private messages" on public.direct_messages
  for delete to authenticated using (sender_id = (select auth.uid()) and public.is_member(stable_id));
comment on table public.direct_messages is 'Private one-to-one app conversations. Only active participants can read. Not connected to group chat, TV, or push triggers.';

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='direct_messages') then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end $$;

-- All stored board history, including inactive/expired posts, with original
-- authors, exact text, and dates. No board rows are updated or removed.
insert into public.community_messages(stable_id, sender_id, body, created_at, board_message_id)
select m.stable_id, m.created_by, m.text, m.created_at, m.id
from public.messages m
join public.stables s on s.id=m.stable_id
where s.name='Stall Nordstjerna'
on conflict (board_message_id) do nothing;
