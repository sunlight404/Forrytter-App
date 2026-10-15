begin;
create temporary table chat_test_context as
select gen_random_uuid() as stable, gen_random_uuid() as other_stable,
       (array_agg(id order by id))[1] as rider,
       (array_agg(id order by id))[2] as other_rider,
       (array_agg(id order by id))[3] as owner,
       gen_random_uuid() as outsider,
       gen_random_uuid() as message_id,
       (select count(*) from public.messages) as tv_message_count,
       (select md5(coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text),'')) from public.get_tv_messages() t) as tv_snapshot
from public.profiles;
create temporary table chat_test_results(test text);
grant select on chat_test_context to authenticated, anon;
grant insert on chat_test_results to authenticated, anon;
insert into public.stables(id,name) select stable,'Isolated chat test' from chat_test_context;
insert into public.stables(id,name) select other_stable,'Other isolated chat test' from chat_test_context;
insert into public.memberships(stable_id,user_id,role,active)
select stable,rider,'rider',true from chat_test_context union all
select stable,other_rider,'rider',true from chat_test_context union all
select stable,owner,'owner',true from chat_test_context;

set local role authenticated;
select set_config('request.jwt.claim.sub',(select rider::text from chat_test_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select rider from chat_test_context),'role','authenticated')::text,true);
insert into public.community_messages(id,stable_id,sender_id,body)
select message_id,stable,rider,'An isolated app-only message' from chat_test_context;
do $$ begin
  if (select count(*) from public.community_messages where stable_id=(select stable from chat_test_context)) <> 1 then raise exception 'Sender cannot read saved message'; end if;
  insert into chat_test_results values ('member sends and reads a saved message');
  begin
    insert into public.community_messages(stable_id,sender_id,body) select stable,other_rider,'Spoofed author' from chat_test_context;
    raise exception 'Sender spoofing was allowed';
  exception when insufficient_privilege then insert into chat_test_results values ('sender spoofing rejected'); end;
  begin
    insert into public.community_messages(stable_id,sender_id,body) select other_stable,rider,'Wrong stable' from chat_test_context;
    raise exception 'Wrong stable was allowed';
  exception when insufficient_privilege then insert into chat_test_results values ('cross-stable send rejected'); end;
  begin
    insert into public.community_messages(stable_id,sender_id,body) select stable,rider,E' \n ' from chat_test_context;
    raise exception 'Blank message was allowed';
  exception when check_violation then insert into chat_test_results values ('blank message rejected'); end;
  begin
    insert into public.community_messages(stable_id,sender_id,body) select stable,rider,repeat('x',2001) from chat_test_context;
    raise exception 'Oversized message was allowed';
  exception when check_violation then insert into chat_test_results values ('oversized message rejected'); end;
  begin
    update public.community_messages set body='Changed author content';
    raise exception 'Message update was allowed';
  exception when insufficient_privilege then insert into chat_test_results values ('immutable messages protected'); end;
end $$;

select set_config('request.jwt.claim.sub',(select other_rider::text from chat_test_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select other_rider from chat_test_context),'role','authenticated')::text,true);
do $$ declare removed int; begin
  if (select count(*) from public.community_messages where stable_id=(select stable from chat_test_context)) <> 1 then raise exception 'Recipient cannot read shared message'; end if;
  insert into chat_test_results values ('other approved member reads shared message');
  delete from public.community_messages where id=(select message_id from chat_test_context);
  get diagnostics removed = row_count;
  if removed<>0 then raise exception 'Rider deleted another member message'; end if;
  insert into chat_test_results values ('other member cannot delete sender message');
end $$;

select set_config('request.jwt.claim.sub',(select outsider::text from chat_test_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select outsider from chat_test_context),'role','authenticated')::text,true);
do $$ begin
  if exists(select 1 from public.community_messages where stable_id=(select stable from chat_test_context)) then raise exception 'Outsider read chat'; end if;
  insert into chat_test_results values ('signed-in non-member cannot read chat');
end $$;

set local role anon;
do $$ begin
  begin
    perform 1 from public.community_messages;
    raise exception 'Anonymous visitor read chat';
  exception when insufficient_privilege then insert into chat_test_results values ('anonymous access rejected'); end;
end $$;

reset role;
update public.memberships set active=false where stable_id=(select stable from chat_test_context) and user_id=(select rider from chat_test_context);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select rider::text from chat_test_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select rider from chat_test_context),'role','authenticated')::text,true);
do $$ begin
  if exists(select 1 from public.community_messages where stable_id=(select stable from chat_test_context)) then raise exception 'Revoked member read chat'; end if;
  begin
    insert into public.community_messages(stable_id,sender_id,body) select stable,rider,'Revoked access' from chat_test_context;
    raise exception 'Revoked member sent chat';
  exception when insufficient_privilege then insert into chat_test_results values ('revoked member cannot read or send'); end;
end $$;
reset role;
update public.memberships set active=true where stable_id=(select stable from chat_test_context) and user_id=(select rider from chat_test_context);

do $$ begin
  if (select count(*) from public.messages)<>(select tv_message_count from chat_test_context) then raise exception 'Chat created TV messages'; end if;
  if (select md5(coalesce(string_agg(to_jsonb(t)::text, ',' order by to_jsonb(t)::text),'')) from public.get_tv_messages() t)<>(select tv_snapshot from chat_test_context) then raise exception 'Chat appeared in TV feed'; end if;
  if exists(select 1 from pg_trigger where tgrelid='public.community_messages'::regclass and not tgisinternal) then raise exception 'Unexpected chat trigger'; end if;
  insert into chat_test_results values ('TV feed and TV messages unchanged; no chat push trigger');
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub',(select owner::text from chat_test_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select owner from chat_test_context),'role','authenticated')::text,true);
do $$ declare removed int; begin
  delete from public.community_messages where id=(select message_id from chat_test_context);
  get diagnostics removed = row_count;
  if removed<>1 then raise exception 'Owner moderation failed'; end if;
  insert into chat_test_results values ('owner can moderate chat');
end $$;
select set_config('request.jwt.claim.sub',(select rider::text from chat_test_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select rider from chat_test_context),'role','authenticated')::text,true);
insert into public.community_messages(id,stable_id,sender_id,body) select message_id,stable,rider,'Sender removal test' from chat_test_context;
do $$ declare removed int; begin
  delete from public.community_messages where id=(select message_id from chat_test_context);
  get diagnostics removed = row_count;
  if removed<>1 then raise exception 'Sender removal failed'; end if;
  insert into chat_test_results values ('sender can delete own message');
end $$;
reset role;
do $$ begin if (select count(*) from chat_test_results)<>14 then raise exception 'Expected 14 completed checks'; end if; end $$;
rollback;
select '14 database checks passed; all test data rolled back' as result;
