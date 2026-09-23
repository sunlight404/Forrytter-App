begin;
do $$
declare actor uuid; target uuid; stable uuid; other_stable uuid; result text;
begin
 select id into actor from public.profiles order by id limit 1;
 select id into target from public.profiles where id<>actor order by id limit 1;
 if target is null then raise exception 'Two profiles required';end if;
 insert into public.stables(name) values('Rollback profile edit test') returning id into stable;
 insert into public.stables(name) values('Rollback other stable') returning id into other_stable;
 insert into public.memberships(stable_id,user_id,role) values(stable,actor,'owner'),(stable,target,'rider'),(other_stable,actor,'owner');
 perform set_config('request.jwt.claim.sub',actor::text,true);
 execute 'set local role authenticated';
 perform public.admin_update_profile_name(stable,target,'  Test name  ');
 select full_name into result from public.profiles where id=target;
 if result<>'Test name' then raise exception 'Name not saved';end if;
 begin
 perform public.admin_update_profile_name(other_stable,target,'Wrong stable');
 raise exception 'Cross stable edit permitted';
 exception when insufficient_privilege then null;end;
 begin
 perform public.admin_update_profile_name(stable,target,' ');
 raise exception 'Empty name permitted';
 exception when invalid_parameter_value then null;end;
 perform set_config('request.jwt.claim.sub',target::text,true);
 begin
 perform public.admin_update_profile_name(stable,actor,'Rider edit');
 raise exception 'Rider edit permitted';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','',true);
 begin
 perform public.admin_update_profile_name(stable,target,'Anonymous edit');
 raise exception 'Anonymous edit permitted';
 exception when insufficient_privilege then null;end;
end;
$$;
rollback;
