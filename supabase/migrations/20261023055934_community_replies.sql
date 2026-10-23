alter table public.community_messages add column parent_id uuid;
alter table public.community_messages add constraint community_messages_parent_id_fkey
  foreign key(parent_id) references public.community_messages(id) on delete cascade;
alter table public.community_messages add constraint community_messages_not_own_parent
  check(parent_id is null or parent_id <> id);
grant insert(parent_id) on public.community_messages to authenticated;
create index community_messages_parent_created_idx on public.community_messages(parent_id, created_at desc, id desc) where parent_id is not null;
create index community_messages_roots_idx on public.community_messages(stable_id, created_at desc, id desc) where parent_id is null;

-- Comments always belong to a visible root message in the same stable.
-- Invoker rights retain the existing membership RLS; no privileged read bypass.
create function private.validate_community_reply() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.parent_id is not null and not exists(
    select 1 from public.community_messages parent
    where parent.id = new.parent_id and parent.stable_id = new.stable_id and parent.parent_id is null
  ) then
    raise exception 'Reply requires a visible root message in the same stable' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_community_reply() from public, anon, authenticated;
create trigger validate_community_reply before insert or update of parent_id, stable_id
  on public.community_messages for each row execute function private.validate_community_reply();

create view public.community_reply_counts with(security_invoker = true) as
  select stable_id, parent_id, count(*) as reply_count
  from public.community_messages where parent_id is not null group by stable_id, parent_id;
revoke all on public.community_reply_counts from public, anon, authenticated;
grant select on public.community_reply_counts to authenticated;
comment on column public.community_messages.parent_id is 'Root group-message ID for a comment. One comment level, same stable. Existing group RLS, image permissions, hearts and push notifications apply.';
