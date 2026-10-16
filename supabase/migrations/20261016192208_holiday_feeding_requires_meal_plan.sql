create or replace function public.validate_feeding_owners(p_stable uuid,p_date date,p_first uuid,p_second uuid,p_third uuid)
returns uuid[] language plpgsql security invoker set search_path='' as $$
declare people uuid[];
begin
 if auth.uid() is null or not public.is_admin(p_stable) then raise exception 'Administrator required' using errcode='42501';end if;
 if p_date is null or p_first is null then raise exception 'Velg minst én person';end if;
 if public.is_feeding_holiday(p_date) then raise exception 'Helligdager må fordeles per måltid. Oppdater appen.';end if;
 people:=pg_catalog.array_remove(array[p_first,p_second,p_third],null);
 if (select count(distinct person) from pg_catalog.unnest(people) person)<>pg_catalog.cardinality(people) then raise exception 'Velg forskjellige personer';end if;
 if p_third is not null and p_second is null then raise exception 'Velg person 2 før du legger til person 3';end if;
 if p_third is not null and not public.is_feeding_holiday(p_date) then raise exception 'Person 3 kan bare legges til på hellig-/høytidsdager';end if;
 if (select count(*) from public.memberships where stable_id=p_stable and user_id=any(people) and active)<>pg_catalog.cardinality(people) then raise exception 'Velg aktive personer i stallen';end if;
 return people;
end;$$;
revoke all on function public.validate_feeding_owners(uuid,date,uuid,uuid,uuid) from public,anon;
grant execute on function public.validate_feeding_owners(uuid,date,uuid,uuid,uuid) to authenticated,service_role;
