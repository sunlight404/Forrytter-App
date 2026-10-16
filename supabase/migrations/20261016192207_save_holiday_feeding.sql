create or replace function public.save_holiday_feeding(p_stable uuid,p_date date,p_morning uuid[],p_lunch uuid[],p_evening uuid[],p_expected uuid[] default '{}')
returns void language plpgsql security invoker set search_path='' as $$
declare actual uuid[];
begin
 perform public.validate_holiday_meal(p_stable,p_date,'morning',p_morning);
 perform public.validate_holiday_meal(p_stable,p_date,'lunch',p_lunch);
 perform public.validate_holiday_meal(p_stable,p_date,'evening',p_evening);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_stable::text||p_date::text,0));
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into actual from public.feeding_shifts where stable_id=p_stable and shift_date=p_date;
 if actual is distinct from coalesce((select array_agg(x order by x) from pg_catalog.unnest(p_expected) x),'{}'::uuid[]) then raise exception 'Fôringene er endret. Oppdater og prøv igjen.';end if;
 delete from public.feeding_shifts where stable_id=p_stable and shift_date=p_date;
 insert into public.feeding_shifts(stable_id,shift_date,shift_time,label,assigned_to,original_assigned_to,created_by,meal,meal_slot)
 select p_stable,p_date,'23:59:59',case kind when 'morning' then 'Morgenfôring' when 'lunch' then 'Lunsjfôring' else 'Kveldsfôring' end,person,person,auth.uid(),kind,slot::smallint
 from (values('morning',p_morning),('lunch',p_lunch),('evening',p_evening)) meals(kind,people)
 cross join lateral pg_catalog.unnest(people) with ordinality owners(person,slot);
end;$$;
revoke all on function public.save_holiday_feeding(uuid,date,uuid[],uuid[],uuid[],uuid[]) from public,anon;
grant execute on function public.save_holiday_feeding(uuid,date,uuid[],uuid[],uuid[],uuid[]) to authenticated,service_role;
