begin;
create temporary table ci as select gen_random_uuid() stable, gen_random_uuid() other_stable,
  (array_agg(id order by id))[1] a, (array_agg(id order by id))[2] b,
  (array_agg(id order by id))[3] admin, (array_agg(id order by id))[4] outsider,
  gen_random_uuid() group_id, gen_random_uuid() direct_id, gen_random_uuid() pending_id
from public.profiles;
alter table ci add column group_path text;
alter table ci add column direct_path text;
alter table ci add column pending_path text;
update ci set group_path=stable||'/'||a||'/'||group_id||'.jpg',
  direct_path=stable||'/'||a||'/'||direct_id||'.jpg', pending_path=stable||'/'||a||'/'||pending_id||'.jpg';
grant select on ci to authenticated,anon;
insert into public.stables(id,name) select stable,'Image access test' from ci union all select other_stable,'Other image test' from ci;
insert into public.memberships(stable_id,user_id,role,active)
select stable,a,'rider',true from ci union all select stable,b,'rider',true from ci
union all select stable,admin,'owner',true from ci union all select other_stable,outsider,'rider',true from ci;
-- Storage metadata fixtures only; no files or notifications are sent. Roll back all rows.
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from ci),true);
select set_config('request.jwt.claims',json_build_object('sub',(select a from ci),'role','authenticated')::text,true);
insert into storage.objects(bucket_id,name) select 'chat-images',group_path from ci union all select 'chat-images',direct_path from ci union all select 'chat-images',pending_path from ci;
do $$ begin
  if exists(select 1 from storage.objects where bucket_id='chat-images') then raise exception 'Unsent file visible'; end if;
  begin
    insert into storage.objects(bucket_id,name) select 'chat-images',stable||'/'||b||'/'||gen_random_uuid()||'.jpg' from ci;
    raise exception 'Spoofed upload allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name) select 'chat-images',other_stable||'/'||a||'/'||gen_random_uuid()||'.jpg' from ci;
    raise exception 'Cross-stable upload allowed';
  exception when insufficient_privilege then null; end;
end $$;
insert into public.community_messages(id,stable_id,sender_id,body,image_path) select group_id,stable,a,'',group_path from ci;
insert into public.direct_messages(id,stable_id,sender_id,recipient_id,body,image_path) select direct_id,stable,a,b,'',direct_path from ci;
do $$ begin
  if (select count(*) from storage.objects where bucket_id='chat-images')<>2 then raise exception 'Sender cannot read attachments'; end if;
  begin
    insert into public.direct_messages(id,stable_id,sender_id,recipient_id,body,image_path) select gen_random_uuid(),stable,a,b,'',direct_path from ci;
    raise exception 'Image reused on another message';
  exception when check_violation then null; end;
  begin
    insert into public.community_messages(stable_id,sender_id,body) select stable,a,'' from ci;
    raise exception 'Empty draft allowed';
  exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub',(select b::text from ci),true);
select set_config('request.jwt.claims',json_build_object('sub',(select b from ci),'role','authenticated')::text,true);
do $$ begin
  if (select count(*) from storage.objects where bucket_id='chat-images')<>2 then raise exception 'Recipient cannot read attachments'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select admin::text from ci),true);
select set_config('request.jwt.claims',json_build_object('sub',(select admin from ci),'role','authenticated')::text,true);
do $$ begin
  if (select count(*) from storage.objects where bucket_id='chat-images')<>1 then raise exception 'Unrelated admin can read private or unsent image'; end if;
  if exists(select 1 from storage.objects where name=(select direct_path from ci)) then raise exception 'Private image exposed'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select outsider::text from ci),true);
select set_config('request.jwt.claims',json_build_object('sub',(select outsider from ci),'role','authenticated')::text,true);
do $$ begin
  if exists(select 1 from storage.objects where bucket_id='chat-images') then raise exception 'Cross-stable image read'; end if;
end $$;
set local role anon;
do $$ begin
  if exists(select 1 from storage.objects where bucket_id='chat-images') then raise exception 'Anonymous image read'; end if;
end $$;
reset role;
update public.memberships set active=false where stable_id=(select stable from ci) and user_id=(select b from ci);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select b::text from ci),true);
select set_config('request.jwt.claims',json_build_object('sub',(select b from ci),'role','authenticated')::text,true);
do $$ begin
  if exists(select 1 from storage.objects where bucket_id='chat-images') then raise exception 'Removed participant can read image'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select a::text from ci),true);
select set_config('request.jwt.claims',json_build_object('sub',(select a from ci),'role','authenticated')::text,true);
delete from public.direct_messages where id=(select direct_id from ci);
delete from public.community_messages where id=(select group_id from ci);
do $$ begin
  if exists(select 1 from storage.objects where bucket_id='chat-images') then raise exception 'Deleted message image still signable'; end if;
end $$;
reset role;
do $$ begin
  if (select public from storage.buckets where id='chat-images') then raise exception 'Bucket is public'; end if;
end $$;
rollback;
select 'Image privacy checks passed; all fixtures rolled back' result;
