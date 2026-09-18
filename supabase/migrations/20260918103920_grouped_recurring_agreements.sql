create or replace function public.save_recurring_agreement_group(
 p_stable uuid,p_user uuid,p_horse uuid,p_parities integer[],p_days integer[],
 p_start date,p_training text,p_previous uuid[] default '{}')
returns void language plpgsql security invoker set search_path='' as $$
begin
 if not public.is_admin(p_stable) then raise exception 'Administrator required' using errcode='42501'; end if;
 if p_user is null or p_horse is null or p_start is null
 or coalesce(cardinality(p_parities),0)=0 or coalesce(cardinality(p_days),0)=0
 or exists(select 1 from unnest(p_parities) p where p is null or p not in (0,1))
 or exists(select 1 from unnest(p_days) d where d is null or d not in (6,7))
 or p_training is null or length(p_training)>4000 then raise exception 'Invalid agreement'; end if;
 if exists(select 1 from unnest(p_previous) requested(id) where not exists(
 select 1 from public.recurring_horse_assignments r where r.id=requested.id and r.stable_id=p_stable and r.user_id=p_user))
 then raise exception 'Invalid previous agreement' using errcode='42501'; end if;
 update public.recurring_horse_assignments set active=false
 where stable_id=p_stable and user_id=p_user and id=any(p_previous)
 and not (week_parity=any(p_parities) and weekday=any(p_days));
 insert into public.recurring_horse_assignments(stable_id,user_id,horse_id,week_parity,weekday,start_date,training_text,active,created_by)
 select p_stable,p_user,p_horse,p,d,p_start,p_training,true,auth.uid()
 from (select distinct unnest(p_parities) p) ps cross join (select distinct unnest(p_days) d) ds
 on conflict(stable_id,user_id,week_parity,weekday) do update
 set horse_id=excluded.horse_id,start_date=excluded.start_date,training_text=excluded.training_text,active=true;
end;
$$;
revoke all on function public.save_recurring_agreement_group(uuid,uuid,uuid,integer[],integer[],date,text,uuid[]) from public,anon;
grant execute on function public.save_recurring_agreement_group(uuid,uuid,uuid,integer[],integer[],date,text,uuid[]) to authenticated;
