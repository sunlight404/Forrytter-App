create or replace function private.admin_update_profile_name(p_stable uuid,p_user uuid,p_name text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.memberships where stable_id=p_stable and user_id=auth.uid() and active and role in ('owner','admin')) then
 raise exception 'Administrator required' using errcode='42501'; end if;
 if not exists(select 1 from public.memberships where stable_id=p_stable and user_id=p_user and not archived) then
 raise exception 'Profile is not part of this stable' using errcode='42501'; end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 120 then raise exception 'Name must contain 1 to 120 characters' using errcode='22023'; end if;
 update public.profiles set full_name=btrim(p_name) where id=p_user;
 if not found then raise exception 'Profile not found'; end if;
end;
$$;
revoke all on function private.admin_update_profile_name(uuid,uuid,text) from public,anon;
grant execute on function private.admin_update_profile_name(uuid,uuid,text) to authenticated;
create or replace function public.admin_update_profile_name(p_stable uuid,p_user uuid,p_name text)
returns void language sql security invoker set search_path='' as $$
 select private.admin_update_profile_name(p_stable,p_user,p_name);
$$;
revoke all on function public.admin_update_profile_name(uuid,uuid,text) from public,anon;
grant execute on function public.admin_update_profile_name(uuid,uuid,text) to authenticated;
