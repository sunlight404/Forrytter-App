create or replace function public.save_daily_feeding_v2(
 p_stable uuid,p_date date,p_first uuid,p_second uuid,p_third uuid,
 p_expected uuid[] default '{}'::uuid[]
)
returns void language plpgsql security invoker set search_path = ''
as $$
declare actual uuid[]; people uuid[];
begin
 people:=public.validate_feeding_owners(p_stable,p_date,p_first,p_second,p_third);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_stable::text||p_date::text,0));
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into actual from public.feeding_shifts where stable_id=p_stable and shift_date=p_date;
 if actual is distinct from coalesce((select array_agg(x order by x) from pg_catalog.unnest(p_expected) x),'{}'::uuid[]) then raise exception 'Fôringene er endret. Oppdater og prøv igjen.';end if;
 delete from public.feeding_shifts where stable_id=p_stable and shift_date=p_date;
 insert into public.feeding_shifts(stable_id,shift_date,shift_time,label,assigned_to,original_assigned_to,created_by,daily_slot)
 select p_stable,p_date,'23:59:59',case when pg_catalog.cardinality(people)=1 then 'Dagsansvar: morgen, lunsj og kveld' else 'Felles ansvar: morgen, lunsj og kveld' end,person,person,auth.uid(),slot::smallint
 from pg_catalog.unnest(array[p_first,p_second,p_third]) with ordinality as owners(person,slot) where person is not null;
end;
$$;
revoke all on function public.save_daily_feeding_v2(uuid,date,uuid,uuid,uuid,uuid[]) from public,anon;
grant execute on function public.save_daily_feeding_v2(uuid,date,uuid,uuid,uuid,uuid[]) to authenticated,service_role;
