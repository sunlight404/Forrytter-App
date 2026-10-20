begin;
create temporary table push_context as select gen_random_uuid() stable,gen_random_uuid() other_stable,
  (array_agg(id order by id))[1] a,(array_agg(id order by id))[2] b,
  (array_agg(id order by id))[3] admin,(array_agg(id order by id))[4] removed,
  (array_agg(id order by id))[5] archived,(array_agg(id order by id))[6] unsubscribed,
  gen_random_uuid() group_id,gen_random_uuid() direct_id,
  (select count(*) from public.messages) board_count from public.profiles;
-- Select existing identities only inside isolated test stables; all rows roll back.
-- No committed push job or HTTP request is created by these checks.
insert into public.stables(id,name) select stable,'Chat push test' from push_context
  union all select other_stable,'Other chat push test' from push_context;
insert into public.memberships(stable_id,user_id,role,active,archived)
select c.stable,v.person,v.role,v.active,v.archived from push_context c cross join lateral
  (values(c.a,'rider',true,false),(c.b,'rider',true,false),(c.admin,'owner',true,false),
         (c.removed,'rider',false,false),(c.archived,'rider',false,true),(c.unsubscribed,'rider',true,false)) v(person,role,active,archived);
insert into public.memberships(stable_id,user_id,role,active)
select other_stable,b,'rider',true from push_context;
insert into public.push_subscriptions(stable_id,user_id,endpoint,subscription)
select c.stable,p,'https://fcm.googleapis.com/test-'||c.stable||'-'||p,'{}'::jsonb
from push_context c cross join lateral unnest(array[c.a,c.b,c.admin,c.removed,c.archived])p;
select set_config('request.jwt.claim.sub',(select a::text from push_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select a from push_context),'role','authenticated')::text,true);
insert into public.community_messages(id,stable_id,sender_id,body)
select group_id,stable,a,'Test group content: must never appear in push' from push_context;
do $$ begin
  if (select count(*) from private.push_outbox where stable_id=(select stable from push_context) and topic='chat_group')<>2 then raise exception 'Group recipients incorrect'; end if;
  if exists(select 1 from private.push_outbox q,push_context c where q.stable_id=c.stable and q.user_id not in(c.b,c.admin)) then raise exception 'Sender, removed, archived or unsubscribed member notified'; end if;
  if exists(select 1 from private.push_outbox where stable_id=(select other_stable from push_context)) then raise exception 'Cross-stable notification'; end if;
end $$;
insert into public.community_messages(stable_id,sender_id,body) select stable,a,'Second group message' from push_context;
do $$ begin
  if (select count(*) from private.push_outbox where stable_id=(select stable from push_context) and topic='chat_group')<>2 then raise exception 'Pending group notifications not coalesced'; end if;
end $$;
insert into public.direct_messages(id,stable_id,sender_id,recipient_id,body)
select direct_id,stable,a,b,'Secret private content: never copied to queue' from push_context;
do $$ begin
  if (select count(*) from private.push_outbox where stable_id=(select stable from push_context) and topic='chat_private')<>1 then raise exception 'Private notification count'; end if;
  if not exists(select 1 from private.push_outbox q,push_context c where q.stable_id=c.stable and q.user_id=c.b and q.topic='chat_private' and q.tab='chatPrivate' and q.title='Ny privat melding') then raise exception 'Private destination incorrect'; end if;
  if exists(select 1 from private.push_outbox q,push_context c where q.stable_id=c.stable and (to_jsonb(q)::text like '%Secret private%' or to_jsonb(q)::text like '%Test group content%')) then raise exception 'Message text leaked'; end if;
end $$;
-- Historical imports must not create notifications, even under a sender session.
delete from private.push_outbox where stable_id=(select stable from push_context);
insert into public.community_messages(stable_id,sender_id,body,board_message_id)
select stable,a,'Imported history',gen_random_uuid() from push_context;
delete from public.community_messages where id=(select group_id from push_context);
delete from public.direct_messages where id=(select direct_id from push_context);
do $$ begin
  if exists(select 1 from private.push_outbox where stable_id=(select stable from push_context)) then raise exception 'Import or delete sent push'; end if;
  if (select count(*) from public.messages)<>(select board_count from push_context) then raise exception 'Board changed'; end if;
  if has_function_privilege('authenticated','private.capture_chat_push()','execute') or has_function_privilege('anon','private.capture_chat_push()','execute') then raise exception 'Trigger API exposed'; end if;
end $$;
-- A disabled subscription prevents any new private job.
delete from public.push_subscriptions where stable_id=(select stable from push_context) and user_id=(select b from push_context);
insert into public.direct_messages(stable_id,sender_id,recipient_id,body) select stable,a,b,'No subscription' from push_context;
do $$ begin
  if exists(select 1 from private.push_outbox where stable_id=(select stable from push_context)) then raise exception 'Unsubscribed recipient notified'; end if;
end $$;
set local role authenticated;
do $$ begin
  begin
    perform 1 from private.push_outbox;
    raise exception 'Outbox accessible to member';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'Chat notification database checks passed; all test data rolled back' result;
