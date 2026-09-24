alter table public.feeding_shifts add column daily_slot smallint check(daily_slot in (1,2));
create unique index feeding_daily_slot_idx on public.feeding_shifts(stable_id,shift_date,daily_slot) where daily_slot is not null;
create unique index feeding_daily_person_idx on public.feeding_shifts(stable_id,shift_date,assigned_to) where daily_slot is not null and assigned_to is not null;
create or replace function public.save_daily_feeding(p_stable uuid,p_date date,p_first uuid,p_second uuid,p_expected uuid[] default '{}')
returns void language plpgsql security invoker set search_path='' as $$
declare actual uuid[];
begin
 if auth.uid() is null or not public.is_admin(p_stable) then raise exception 'Administrator required' using errcode='42501';end if;
 if p_date is null or p_first is null or p_second is null or p_first=p_second then raise exception 'Velg to forskjellige personer';end if;
 if (select count(*) from public.memberships where stable_id=p_stable and user_id in(p_first,p_second) and active)<>2 then raise exception 'Velg to aktive personer i stallen';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_stable::text||p_date::text,0));
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into actual from public.feeding_shifts where stable_id=p_stable and shift_date=p_date;
 if actual is distinct from coalesce((select array_agg(x order by x) from unnest(p_expected) x),'{}'::uuid[]) then raise exception 'Fôringene er endret. Oppdater og prøv igjen.';end if;
 delete from public.feeding_shifts where stable_id=p_stable and shift_date=p_date;
 insert into public.feeding_shifts(stable_id,shift_date,shift_time,label,assigned_to,original_assigned_to,created_by,daily_slot)
 values(p_stable,p_date,'23:59:59','Felles ansvar: morgen, lunsj og kveld',p_first,p_first,auth.uid(),1),
 (p_stable,p_date,'23:59:59','Felles ansvar: morgen, lunsj og kveld',p_second,p_second,auth.uid(),2);
end;
$$;
revoke all on function public.save_daily_feeding(uuid,date,uuid,uuid,uuid[]) from public,anon;
grant execute on function public.save_daily_feeding(uuid,date,uuid,uuid,uuid[]) to authenticated;
