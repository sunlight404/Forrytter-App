-- New messages only: no alerts for old board history, hearts or deletions.
-- The trigger needs definer rights solely to enqueue into the private outbox.
create or replace function private.capture_chat_push()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare person uuid;
begin
  if new.sender_id is null or new.sender_id is distinct from auth.uid() then return null; end if;
  if not exists(select 1 from public.memberships where stable_id=new.stable_id and user_id=new.sender_id and active and not archived) then return null; end if;
  if tg_table_name='community_messages' then
    if new.board_message_id is not null then return null; end if;
    for person in select user_id from public.memberships
      where stable_id=new.stable_id and active and not archived and user_id<>new.sender_id
    loop
      perform private.queue_app_push(new.stable_id,person,'chat_group','Ny melding i gruppechatten','chat');
    end loop;
  elsif tg_table_name='direct_messages' then
    if new.recipient_id<>new.sender_id and exists(
      select 1 from public.memberships where stable_id=new.stable_id and user_id=new.recipient_id and active and not archived
    ) then
      perform private.queue_app_push(new.stable_id,new.recipient_id,'chat_private','Ny privat melding','chatPrivate');
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.capture_chat_push() from public, anon, authenticated;
create trigger push_community_message after insert on public.community_messages
  for each row execute function private.capture_chat_push();
create trigger push_direct_message after insert on public.direct_messages
  for each row execute function private.capture_chat_push();
comment on table public.direct_messages is 'Private conversations. Participants only; new messages enqueue a generic notification solely for the recipient. No group chat or TV mirroring.';
