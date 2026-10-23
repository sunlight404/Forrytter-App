begin;
create temporary table cr as select gen_random_uuid() stable,gen_random_uuid() other_stable,
  (array_agg(id order by id))[1] a,(array_agg(id order by id))[2] b,(array_agg(id order by id))[3] outsider,
  gen_random_uuid() root_id,gen_random_uuid() reply_id,gen_random_uuid() other_root from public.profiles;
grant select on cr to authenticated,anon;
insert into public.stables(id,name) select stable,'Comment test' from cr union all select other_stable,'Other comment test' from cr;
insert into public.memberships(stable_id,user_id,role,active)
select stable,a,'rider',true from cr union all select stable,b,'rider',true from cr union all select other_stable,outsider,'rider',true from cr;
insert into public.community_messages(id,stable_id,sender_id,body) select other_root,other_stable,outsider,'Other stable root' from cr;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from cr),true);
select set_config('request.jwt.claims',json_build_object('sub',(select a from cr),'role','authenticated')::text,true);
insert into public.community_messages(id,stable_id,sender_id,body) select root_id,stable,a,'Original group message' from cr;
select set_config('request.jwt.claim.sub',(select b::text from cr),true);
select set_config('request.jwt.claims',json_build_object('sub',(select b from cr),'role','authenticated')::text,true);
insert into public.community_messages(id,stable_id,sender_id,body,parent_id) select reply_id,stable,b,'Another member comments',root_id from cr;
do $$ begin
  if (select reply_count from public.community_reply_counts where parent_id=(select root_id from cr))<>1 then raise exception 'Comment count incorrect'; end if;
  if not exists(select 1 from public.community_messages where id=(select reply_id from cr)) then raise exception 'Member cannot read reply'; end if;
  begin
    insert into public.community_messages(stable_id,sender_id,body,parent_id) select stable,b,'Cross-stable reply',other_root from cr;
    raise exception 'Cross-stable parent accepted';
  exception when check_violation then null; end;
  begin
    insert into public.community_messages(stable_id,sender_id,body,parent_id) select stable,b,'Nested reply',reply_id from cr;
    raise exception 'Nested reply accepted';
  exception when check_violation then null; end;
  begin
    insert into public.community_messages(stable_id,sender_id,body,parent_id) select stable,b,'Missing root',gen_random_uuid() from cr;
    raise exception 'Missing parent accepted';
  exception when check_violation then null; end;
  begin
    insert into public.community_messages(stable_id,sender_id,body,parent_id) select stable,a,'Spoofed reply',root_id from cr;
    raise exception 'Spoofed sender accepted';
  exception when insufficient_privilege then null; end;
  delete from public.community_messages where id=(select root_id from cr);
  if not exists(select 1 from public.community_messages where id=(select root_id from cr)) then raise exception 'Commenter deleted another members root'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select outsider::text from cr),true);
select set_config('request.jwt.claims',json_build_object('sub',(select outsider from cr),'role','authenticated')::text,true);
do $$ begin
  if exists(select 1 from public.community_reply_counts where stable_id=(select stable from cr)) then raise exception 'Counts leaked to other stable'; end if;
  if exists(select 1 from public.community_messages where parent_id=(select root_id from cr)) then raise exception 'Replies leaked'; end if;
end $$;
reset role;
update public.memberships set active=false where stable_id=(select stable from cr) and user_id=(select b from cr);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select b::text from cr),true);
select set_config('request.jwt.claims',json_build_object('sub',(select b from cr),'role','authenticated')::text,true);
do $$ begin
  if exists(select 1 from public.community_reply_counts where stable_id=(select stable from cr)) then raise exception 'Revoked member sees counts'; end if;
  begin
    insert into public.community_messages(stable_id,sender_id,body,parent_id) select stable,b,'Revoked reply',root_id from cr;
    raise exception 'Revoked member commented';
  exception when insufficient_privilege or check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub',(select a::text from cr),true);
select set_config('request.jwt.claims',json_build_object('sub',(select a from cr),'role','authenticated')::text,true);
delete from public.community_messages where id=(select root_id from cr);
reset role;
do $$ begin
  if exists(select 1 from public.community_messages where id=(select reply_id from cr)) then raise exception 'Deleted root left orphan comment'; end if;
  if exists(select 1 from public.community_reply_counts where stable_id=(select stable from cr)) then raise exception 'Deleted root left stale count'; end if;
  if has_table_privilege('anon','public.community_reply_counts','select') then raise exception 'Anonymous count access granted'; end if;
  if has_function_privilege('authenticated','private.validate_community_reply()','execute') then raise exception 'Trigger callable directly'; end if;
end $$;
rollback;
select 'Group comment access, counts, parent validation and deletion checks passed; fixtures rolled back' result;
