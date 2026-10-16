create or replace function public.validate_holiday_meal(p_stable uuid,p_date date,p_meal text,p_people uuid[])
returns void language plpgsql security invoker set search_path='' as $$
declare capacity integer; selected integer;
begin
 if auth.uid() is null or not public.is_admin(p_stable) then raise exception 'Administrator required' using errcode='42501';end if;
 if p_date is null or not public.is_feeding_holiday(p_date) then raise exception 'Velg en rød dag i stallkalenderen';end if;
 if p_meal not in('morning','lunch','evening') or p_meal is null then raise exception 'Ugyldig måltid';end if;
 capacity:=case when p_meal='lunch' then 1 else 2 end;
 if pg_catalog.cardinality(p_people) is distinct from capacity then raise exception 'Ugyldig antall plasser til %',p_meal;end if;
 select count(person) into selected from pg_catalog.unnest(p_people) person;
 if (select count(distinct person) from pg_catalog.unnest(p_people) person)<>selected then raise exception 'Velg forskjellige personer til %',p_meal;end if;
 if (select count(*) from public.memberships where stable_id=p_stable and active and user_id=any(p_people))<>selected then raise exception 'Velg aktive personer i stallen';end if;
end;$$;
revoke all on function public.validate_holiday_meal(uuid,date,text,uuid[]) from public,anon;
grant execute on function public.validate_holiday_meal(uuid,date,text,uuid[]) to authenticated,service_role;
