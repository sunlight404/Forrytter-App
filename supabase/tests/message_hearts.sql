begin;
create temporary table heart_context as
select gen_random_uuid() stable,gen_random_uuid() other_stable,
 (array_agg(id order by id))[1] a,(array_agg(id order by id))[2] b,
 (array_agg(id order by id))[3] admin,(array_agg(id order by id))[4] outsider,
 gen_random_uuid() group_id,gen_random_uuid() direct_id,gen_random_uuid() board_id,
 (select md5(coalesce(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text),'')) from public.get_tv_messages() t) tv_snapshot
from public.profiles;
create temporary table heart_results(test text);
grant select on heart_context to authenticated,anon;
grant insert on heart_results to authenticated,anon;
insert into public.stables(id,name) select stable,'Isolated heart test' from heart_context union all select other_stable,'Other heart test' from heart_context;
insert into public.memberships(stable_id,user_id,role,active)
 select stable,a,'rider',true from heart_context union all select stable,b,'rider',true from heart_context union all
 select stable,admin,'owner',true from heart_context union all select other_stable,outsider,'rider',true from heart_context;
insert into public.messages(id,stable_id,created_by,text) select board_id,stable,admin,'Isolated board fixture' from heart_context;
insert into public.community_messages(id,stable_id,sender_id,body,board_message_id) select group_id,stable,a,'Isolated group fixture',board_id from heart_context;
insert into public.direct_messages(id,stable_id,sender_id,recipient_id,body) select direct_id,stable,a,b,'Isolated private fixture' from heart_context;

set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from heart_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select a from heart_context),'role','authenticated')::text,true);
insert into public.message_reactions(community_message_id,user_id) select group_id,a from heart_context;
insert into public.message_reactions(direct_message_id,user_id) select direct_id,a from heart_context;
insert into public.message_reactions(board_message_id,user_id) select board_id,a from heart_context;
do $$ begin
 if (select count(*) from public.message_reactions where user_id=(select a from heart_context) and (community_message_id=(select group_id from heart_context) or direct_message_id=(select direct_id from heart_context) or board_message_id=(select board_id from heart_context)))<>3 then raise exception 'Cannot add/read hearts on three message types';end if;
 insert into heart_results values('hearts work on group, private, and board messages');
 begin
  insert into public.message_reactions(community_message_id,user_id) select group_id,a from heart_context;
  raise exception 'Duplicate heart allowed';
 exception when unique_violation then insert into heart_results values('one heart per person and message');end;
 begin
  insert into public.message_reactions(community_message_id,user_id) select group_id,b from heart_context;
  raise exception 'Spoofed heart allowed';
 exception when insufficient_privilege then insert into heart_results values('cannot acknowledge as someone else');end;
 begin
  insert into public.message_reactions(community_message_id,direct_message_id,user_id) select group_id,direct_id,a from heart_context;
  raise exception 'Multiple targets allowed';
 exception when check_violation then insert into heart_results values('multiple targets rejected');end;
 begin
  insert into public.message_reactions(user_id) select a from heart_context;
  raise exception 'Missing target allowed';
 exception when check_violation or insufficient_privilege then insert into heart_results values('missing target rejected');end;
 begin
  insert into public.message_reactions(board_message_id,user_id,created_at) select board_id,a,now()-interval '1 year' from heart_context;
  raise exception 'Client timestamp allowed';
 exception when insufficient_privilege then insert into heart_results values('server timestamp protected');end;
 begin
  update public.message_reactions set user_id=(select b from heart_context) where community_message_id=(select group_id from heart_context);
  raise exception 'Reaction reassignment allowed';
 exception when insufficient_privilege then insert into heart_results values('heart identity and target immutable');end;
 if (select count(*) from public.message_reactions r join public.community_messages m on m.board_message_id=r.board_message_id where m.id=(select group_id from heart_context))<>1 then raise exception 'Copied board acknowledgement missing';end if;
 insert into heart_results values('copied board post can use original board hearts');
end $$;

select set_config('request.jwt.claim.sub',(select b::text from heart_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select b from heart_context),'role','authenticated')::text,true);
do $$ begin
 if (select count(*) from public.message_reactions where community_message_id=(select group_id from heart_context) or direct_message_id=(select direct_id from heart_context) or board_message_id=(select board_id from heart_context))<>3 then raise exception 'Participant cannot see acknowledgements';end if;
 if not exists(select 1 from public.message_reactions r join public.profiles p on p.id=r.user_id where r.direct_message_id=(select direct_id from heart_context)) then raise exception 'Reactor name unavailable';end if;
 insert into heart_results values('participant sees hearts and profile names');
end $$;
insert into public.message_reactions(community_message_id,user_id) select group_id,b from heart_context;
do $$ declare removed_count int; begin
 if (select count(*) from public.message_reactions where community_message_id=(select group_id from heart_context))<>2 then raise exception 'Two users did not have two hearts';end if;
 insert into heart_results values('two people are counted separately');
 delete from public.message_reactions where community_message_id=(select group_id from heart_context) and user_id=(select a from heart_context);
 get diagnostics removed_count=row_count;
 if removed_count<>0 then raise exception 'Removed someone else heart';end if;
 insert into heart_results values('cannot remove another persons heart');
 delete from public.message_reactions where community_message_id=(select group_id from heart_context) and user_id=(select b from heart_context);
 get diagnostics removed_count=row_count;
 if removed_count<>1 then raise exception 'Cannot remove own heart';end if;
 insert into heart_results values('own heart can be removed');
 delete from public.message_reactions where community_message_id=(select group_id from heart_context) and user_id=(select b from heart_context);
 get diagnostics removed_count=row_count;
 if removed_count<>0 then raise exception 'Repeat removal changed something';end if;
 insert into heart_results values('repeat removal is safe');
end $$;

select set_config('request.jwt.claim.sub',(select admin::text from heart_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select admin from heart_context),'role','authenticated')::text,true);
do $$ declare removed_count int;begin
 if exists(select 1 from public.message_reactions where direct_message_id=(select direct_id from heart_context)) then raise exception 'Admin saw private heart';end if;
 insert into heart_results values('unrelated admin cannot see private reactions');
 begin
  insert into public.message_reactions(direct_message_id,user_id) select direct_id,admin from heart_context;
  raise exception 'Admin reacted to private message';
 exception when insufficient_privilege then insert into heart_results values('unrelated admin cannot react to private message');end;
 delete from public.message_reactions where community_message_id=(select group_id from heart_context);
 get diagnostics removed_count=row_count;
 if removed_count<>0 then raise exception 'Admin removed other user heart';end if;
 insert into heart_results values('admin cannot manipulate other acknowledgements');
end $$;

select set_config('request.jwt.claim.sub',(select outsider::text from heart_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select outsider from heart_context),'role','authenticated')::text,true);
do $$ begin
 if exists(select 1 from public.message_reactions where community_message_id=(select group_id from heart_context) or direct_message_id=(select direct_id from heart_context) or board_message_id=(select board_id from heart_context)) then raise exception 'Outsider saw hearts';end if;
 insert into heart_results values('other stable cannot read counts or names');
 begin
  insert into public.message_reactions(community_message_id,user_id) select group_id,outsider from heart_context;
  raise exception 'Outsider reacted';
 exception when insufficient_privilege then insert into heart_results values('other stable cannot react');end;
end $$;
set local role anon;
do $$ begin
 begin
  perform 1 from public.message_reactions;
  raise exception 'Anonymous visitor read hearts';
 exception when insufficient_privilege then insert into heart_results values('anonymous visitors cannot read hearts');end;
end $$;

reset role;
select set_config('request.jwt.claim.sub',(select admin::text from heart_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select admin from heart_context),'role','authenticated')::text,true);
update public.memberships set active=false where stable_id=(select stable from heart_context) and user_id=(select a from heart_context);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from heart_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select a from heart_context),'role','authenticated')::text,true);
do $$ begin
 if exists(select 1 from public.message_reactions where community_message_id=(select group_id from heart_context) or direct_message_id=(select direct_id from heart_context) or board_message_id=(select board_id from heart_context)) then raise exception 'Revoked user read hearts';end if;
 begin
  insert into public.message_reactions(community_message_id,user_id) select group_id,a from heart_context;
  raise exception 'Revoked user reacted';
 exception when insufficient_privilege then insert into heart_results values('revoked membership cannot read or react');end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select admin::text from heart_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select admin from heart_context),'role','authenticated')::text,true);
update public.memberships set active=true where stable_id=(select stable from heart_context) and user_id=(select a from heart_context);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from heart_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select a from heart_context),'role','authenticated')::text,true);
do $$ declare removed_count int;begin
 delete from public.message_reactions where community_message_id=(select group_id from heart_context) and user_id=(select a from heart_context);
 get diagnostics removed_count=row_count;
 if removed_count<>1 then raise exception 'Restored user cannot remove own heart';end if;
 insert into heart_results values('acknowledgement can be undone after reload/restored access');
end $$;
reset role;
delete from public.direct_messages where id=(select direct_id from heart_context);
do $$ begin
 if exists(select 1 from public.message_reactions where direct_message_id=(select direct_id from heart_context)) then raise exception 'Reaction did not cascade with message';end if;
 insert into heart_results values('deleting a message removes its hearts');
 if (select md5(coalesce(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text),'')) from public.get_tv_messages() t)<>(select tv_snapshot from heart_context) then raise exception 'TV feed changed';end if;
 if exists(select 1 from pg_trigger where tgrelid='public.message_reactions'::regclass and not tgisinternal) then raise exception 'Unexpected reaction notification trigger';end if;
 insert into heart_results values('TV feed unchanged and no reaction push trigger');
 if (select count(*) from heart_results)<>23 then raise exception 'Expected 23 checks, got %',(select count(*) from heart_results);end if;
end $$;
rollback;
select '23 heart database checks passed; all fixtures rolled back' result;
