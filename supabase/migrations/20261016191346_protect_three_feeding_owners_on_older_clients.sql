-- Older clients keep working for one/two owners and cannot silently discard slot 3.
create or replace function public.save_daily_feeding(p_stable uuid,p_date date,p_first uuid,p_second uuid,p_expected uuid[] default '{}'::uuid[])
returns void language plpgsql security invoker set search_path = ''
as $$
begin
 if auth.uid() is null or not public.is_admin(p_stable) then raise exception 'Administrator required' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_stable::text||p_date::text,0));
 if exists(select 1 from public.feeding_shifts where stable_id=p_stable and shift_date=p_date and daily_slot=3) then raise exception 'Dagen har tre ansvarlige. Oppdater appen før du endrer denne dagen.';end if;
 perform public.save_daily_feeding_v2(p_stable,p_date,p_first,p_second,null,p_expected);
end;
$$;
revoke all on function public.save_daily_feeding(uuid,date,uuid,uuid,uuid[]) from public,anon;
grant execute on function public.save_daily_feeding(uuid,date,uuid,uuid,uuid[]) to authenticated,service_role;
