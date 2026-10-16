begin;
create temporary table holiday_feed_context as
select gen_random_uuid() stable,(array_agg(id order by id))[1] owner,
 (array_agg(id order by id))[2] a,(array_agg(id order by id))[3] b,
 (select md5(coalesce(string_agg(to_jsonb(f)::text,',' order by f.id),'')) from public.feeding_shifts f) original_snapshot
from public.profiles;
insert into public.stables(id,name) select stable,'Isolated holiday feeding test' from holiday_feed_context;
insert into public.memberships(stable_id,user_id,role,active)
 select stable,owner,'owner',true from holiday_feed_context union all
 select stable,a,'rider',true from holiday_feed_context union all
 select stable,b,'rider',true from holiday_feed_context;
grant select on holiday_feed_context to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select owner::text from holiday_feed_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select owner from holiday_feed_context),'role','authenticated')::text,true);
select public.save_daily_feeding(stable,'2027-03-25',a,null,'{}'::uuid[]) from holiday_feed_context;
do $$ begin
 if (select count(*) from public.feeding_shifts where stable_id=(select stable from holiday_feed_context) and shift_date='2027-03-25' and daily_slot=1 and label='Dagsansvar: morgen, lunsj og kveld')<>1 then raise exception 'Holiday weekday does not save daily feeding';end if;
end $$;
select public.save_daily_feeding(stable,'2027-03-25',a,b,(select array_agg(id) from public.feeding_shifts where stable_id=c.stable and shift_date='2027-03-25')) from holiday_feed_context c;
do $$ begin
 if (select count(*) from public.feeding_shifts where stable_id=(select stable from holiday_feed_context) and shift_date='2027-03-25' and daily_slot in(1,2) and label='Felles ansvar: morgen, lunsj og kveld')<>2 then raise exception 'Shared holiday feeding did not save';end if;
 begin
  perform public.save_daily_feeding(stable,'2027-03-25',a,null,'{}'::uuid[]) from holiday_feed_context;
  raise exception 'Expected stale-save rejection';
 exception when raise_exception then if sqlerrm not like 'Fôringene er endret.%' then raise;end if;end;
 if (select count(*) from public.feeding_shifts where stable_id=(select stable from holiday_feed_context) and shift_date='2027-03-25')<>2 then raise exception 'Rejected save changed shifts';end if;
end $$;
select set_config('request.jwt.claim.sub',(select a::text from holiday_feed_context),true);
select set_config('request.jwt.claims',json_build_object('sub',(select a from holiday_feed_context),'role','authenticated')::text,true);
do $$ begin
 begin
  perform public.save_daily_feeding(stable,'2027-05-17',a,null,'{}'::uuid[]) from holiday_feed_context;
  raise exception 'Rider was allowed to assign holiday feedings';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 if (select md5(coalesce(string_agg(to_jsonb(f)::text,',' order by f.id),'')) from public.feeding_shifts f where stable_id<>(select stable from holiday_feed_context))<>(select original_snapshot from holiday_feed_context) then raise exception 'Existing real shifts changed';end if;
end $$;
rollback;
select '6 holiday feeding checks passed; all test data rolled back' result;
