-- One immutable, private JPEG attachment per chat message.
alter table public.community_messages add column image_path text;
alter table public.direct_messages add column image_path text;
alter table public.community_messages drop constraint community_messages_body_check;
alter table public.direct_messages drop constraint direct_messages_body_check;
alter table public.community_messages add constraint community_messages_body_check
  check (char_length(body) <= 2000 and (body ~ '[^[:space:]]' or image_path is not null));
alter table public.direct_messages add constraint direct_messages_body_check
  check (char_length(body) <= 2000 and (body ~ '[^[:space:]]' or image_path is not null));
alter table public.community_messages add constraint community_messages_image_path_check
  check (image_path is null or image_path = stable_id::text || '/' || coalesce(sender_id::text, split_part(image_path, '/', 2)) || '/' || id::text || '.jpg');
alter table public.direct_messages add constraint direct_messages_image_path_check
  check (image_path is null or image_path = stable_id::text || '/' || sender_id::text || '/' || id::text || '.jpg');
grant insert(image_path) on public.community_messages, public.direct_messages to authenticated;
create index community_messages_image_path_idx on public.community_messages(image_path) where image_path is not null;
create index direct_messages_image_path_idx on public.direct_messages(image_path) where image_path is not null;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 5242880, array['image/jpeg']);

-- RLS on the message subqueries supplies the same stable/participant rules as chat.
-- Unsent or deleted attachments cannot be downloaded or signed.
create policy "chat participants read attached images" on storage.objects
for select to authenticated using (
  bucket_id = 'chat-images' and (
    exists(select 1 from public.community_messages m where m.image_path = storage.objects.name)
    or exists(select 1 from public.direct_messages m where m.image_path = storage.objects.name)
  )
);
create policy "active members upload their own chat images" on storage.objects
for insert to authenticated with check (
  bucket_id = 'chat-images'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.]jpg$'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists(select 1 from public.memberships m
    where m.stable_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid()) and m.active and not m.archived)
);
-- No UPDATE policy: attachments cannot be replaced behind an existing message.
