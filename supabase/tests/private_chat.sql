begin;
create temporary table dm_context as
select gen_random_uuid() stable,gen_random_uuid() other_stable,
  (array_agg(id order by id))[1] a,(array_agg(id order by id))[2] b,
  (array_agg(id order by id))[3] admin,(array_agg(id order by id))[4] removed,
  (array_agg(id order by id))[5] outsider,gen_random_uuid() message_id,
  (select count(*) from public.community_messages) group_count,
  (select count(*) from public.messages) board_count,
  (select md5(coalesce(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text),'')) from public.get_tv_messages() t) tv_snapshot
from public.profiles;
create temporary table dm_results(test text);
grant select on dm_context to authenticated,anon;
grant insert on dm_results to authenticated,anon;
insert into public.stables(id,name) select stable,'Isolated private chat test' from dm_context union all select other_stable,'Other private chat test' from dm_context;
insert into public.memberships(stable_id,user_id,role,active)
select stable,a,'rider',true from dm_context union all
select stable,b,'rider',true from dm_context union all
select stable,admin,'owner',true from dm_context union all
select stable,removed,'rider',false from dm_context union all
select other_stable,outsider,'rider',true from dm_context;

set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from dm_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select a from dm_context),'role','authenticated')::text,true);
insert into public.direct_messages(id,stable_id,sender_id,recipient_id,body)
select message_id,stable,a,b,'Private message test' from dm_context;
do $$ begin
  if (select count(*) from public.direct_messages where stable_id=(select stable from dm_context))<>1 then raise exception 'Sender cannot read message'; end if;
  insert into dm_results values('sender sends and reads');
  begin
    insert into public.direct_messages(stable_id,sender_id,recipient_id,body) select stable,b,a,'Spoof' from dm_context;
    raise exception 'Spoofed sender allowed';
  exception when insufficient_privilege then insert into dm_results values('sender spoofing rejected'); end;
  begin
    insert into public.direct_messages(stable_id,sender_id,recipient_id,body) select stable,a,outsider,'Other stable recipient' from dm_context;
    raise exception 'Outsider recipient allowed';
  exception when insufficient_privilege then insert into dm_results values('recipient from another stable rejected'); end;
  begin
    insert into public.direct_messages(stable_id,sender_id,recipient_id,body) select other_stable,a,outsider,'Other stable send' from dm_context;
    raise exception 'Cross-stable send allowed';
  exception when insufficient_privilege then insert into dm_results values('cross-stable send rejected'); end;
  begin
    insert into public.direct_messages(stable_id,sender_id,recipient_id,body) select stable,a,removed,'Removed recipient' from dm_context;
    raise exception 'Removed recipient allowed';
  exception when insufficient_privilege then insert into dm_results values('removed recipient rejected'); end;
  begin
    insert into public.direct_messages(stable_id,sender_id,recipient_id,body) select stable,a,a,'Self send' from dm_context;
    raise exception 'Self send allowed';
  exception when insufficient_privilege or check_violation then insert into dm_results values('self send rejected'); end;
  begin
    insert into public.direct_messages(stable_id,sender_id,recipient_id,body) select stable,a,b,E' \n ' from dm_context;
    raise exception 'Blank message allowed';
  exception when check_violation then insert into dm_results values('blank message rejected'); end;
  begin
    insert into public.direct_messages(stable_id,sender_id,recipient_id,body) select stable,a,b,repeat('x',2001) from dm_context;
    raise exception 'Oversized message allowed';
  exception when check_violation then insert into dm_results values('oversized message rejected'); end;
  begin
    insert into public.direct_messages(stable_id,sender_id,recipient_id,body,created_at) select stable,a,b,'Forged date',now()-interval '1 year' from dm_context;
    raise exception 'Client-created timestamp allowed';
  exception when insufficient_privilege then insert into dm_results values('server timestamp protected'); end;
  begin
    update public.direct_messages set body='Changed' where id=(select message_id from dm_context);
    raise exception 'Message modification allowed';
  exception when insufficient_privilege then insert into dm_results values('messages are immutable'); end;
  begin
    insert into public.community_messages(stable_id,sender_id,body,board_message_id) select stable,a,'Fake import',gen_random_uuid() from dm_context;
    raise exception 'Client import marker allowed';
  exception when insufficient_privilege then insert into dm_results values('board import marker protected'); end;
end $$;

select set_config('request.jwt.claim.sub',(select b::text from dm_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select b from dm_context),'role','authenticated')::text,true);
do $$ declare removed_count int; begin
  if (select count(*) from public.direct_messages where id=(select message_id from dm_context))<>1 then raise exception 'Recipient cannot read'; end if;
  insert into dm_results values('recipient reads incoming message');
  delete from public.direct_messages where id=(select message_id from dm_context);
  get diagnostics removed_count=row_count;
  if removed_count<>0 then raise exception 'Recipient deleted sender message'; end if;
  insert into dm_results values('recipient cannot delete sender message');
end $$;
insert into public.direct_messages(stable_id,sender_id,recipient_id,body) select stable,b,a,'Reply' from dm_context;
do $$ begin
  if (select count(*) from public.direct_messages where stable_id=(select stable from dm_context))<>2 then raise exception 'Reply unavailable'; end if;
  insert into dm_results values('recipient replies in same conversation');
end $$;

select set_config('request.jwt.claim.sub',(select admin::text from dm_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select admin from dm_context),'role','authenticated')::text,true);
do $$ declare removed_count int; begin
  if exists(select 1 from public.direct_messages where stable_id=(select stable from dm_context)) then raise exception 'Unrelated admin read private messages'; end if;
  insert into dm_results values('unrelated administrator cannot read private messages');
  delete from public.direct_messages where stable_id=(select stable from dm_context);
  get diagnostics removed_count=row_count;
  if removed_count<>0 then raise exception 'Admin deleted private messages'; end if;
  insert into dm_results values('unrelated administrator cannot delete private messages');
end $$;

select set_config('request.jwt.claim.sub',(select outsider::text from dm_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select outsider from dm_context),'role','authenticated')::text,true);
do $$ begin
  if exists(select 1 from public.direct_messages where stable_id=(select stable from dm_context)) then raise exception 'Outsider read private messages'; end if;
  insert into dm_results values('other stable member cannot read');
end $$;
set local role anon;
do $$ begin
  begin
    perform 1 from public.direct_messages;
    raise exception 'Anonymous access allowed';
  exception when insufficient_privilege then insert into dm_results values('anonymous access rejected'); end;
end $$;

reset role;
update public.memberships set active=false where stable_id=(select stable from dm_context) and user_id=(select b from dm_context);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select b::text from dm_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select b from dm_context),'role','authenticated')::text,true);
do $$ begin
  if exists(select 1 from public.direct_messages where stable_id=(select stable from dm_context)) then raise exception 'Revoked participant read messages'; end if;
  begin
    insert into public.direct_messages(stable_id,sender_id,recipient_id,body) select stable,b,a,'Revoked sender' from dm_context;
    raise exception 'Revoked sender allowed';
  exception when insufficient_privilege then insert into dm_results values('revoked participant cannot read or send'); end;
end $$;
select set_config('request.jwt.claim.sub',(select a::text from dm_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select a from dm_context),'role','authenticated')::text,true);
do $$ declare removed_count int; begin
  if (select count(*) from public.direct_messages where stable_id=(select stable from dm_context))<>2 then raise exception 'Existing sender lost history'; end if;
  insert into dm_results values('active participant keeps history after other participant leaves');
  delete from public.direct_messages where id=(select message_id from dm_context);
  get diagnostics removed_count=row_count;
  if removed_count<>1 then raise exception 'Sender cannot delete own message'; end if;
  insert into dm_results values('sender deletes own message');
end $$;

reset role;
do $$ begin
  if (select count(*) from public.community_messages)<>(select group_count from dm_context) then raise exception 'Private messages appeared in group chat'; end if;
  if (select count(*) from public.messages)<>(select board_count from dm_context) then raise exception 'Private messages appeared on board'; end if;
  if (select md5(coalesce(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text),'')) from public.get_tv_messages() t)<>(select tv_snapshot from dm_context) then raise exception 'TV feed changed'; end if;
  if exists(select 1 from pg_trigger where tgrelid='public.direct_messages'::regclass and not tgisinternal) then raise exception 'Unexpected direct-message trigger'; end if;
  insert into dm_results values('group chat, board, TV and push remain separate');
  if (select count(*) from dm_results)<>22 then raise exception 'Expected 22 completed checks, got %',(select count(*) from dm_results); end if;
end $$;
rollback;
select '22 private-chat database checks passed; all test data rolled back' result;
