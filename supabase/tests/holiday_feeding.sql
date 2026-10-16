-- Independent cases, each isolated and rolled back. Split at -- CASE to run individually.

-- CASE meal-counts-and-optional-third
begin;
create temporary table feed_test as select gen_random_uuid() s,array_agg(id order by id) u from (select id from public.profiles order by id limit 5) p;
insert into public.stables(id,name) select s,'Isolated third holiday feeding test' from feed_test;
insert into public.memberships(stable_id,user_id,role,active) select s,u[1],'owner',true from feed_test union all select s,person,'rider',true from feed_test,unnest(u[2:4]) person;
grant select on feed_test to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select u[1]::text from feed_test),true);
do $$ declare c record;ids uuid[];begin
 select * into c from feed_test;
 perform public.save_holiday_feeding(c.s,'2027-03-25',c.u[2:3],array[c.u[2]],c.u[2:3],'{}');
 assert (select count(*) from public.feeding_shifts where stable_id=c.s)=5,'Expected five assignments';
 assert (select count(distinct assigned_to) from public.feeding_shifts where stable_id=c.s)=2,'Third person should be optional';
 assert (select count(*) from public.feeding_shifts where stable_id=c.s and meal='morning')=2;
 assert (select count(*) from public.feeding_shifts where stable_id=c.s and meal='lunch')=1;
 assert (select count(*) from public.feeding_shifts where stable_id=c.s and meal='evening')=2;
 select array_agg(id) into ids from public.feeding_shifts where stable_id=c.s;
 perform public.save_holiday_feeding(c.s,'2027-03-25',c.u[2:3],array[c.u[4]],c.u[2:3],ids);
 assert (select count(distinct assigned_to) from public.feeding_shifts where stable_id=c.s)=3,'Third lunch owner did not save';
end $$;
rollback;
select 'meal-counts-and-optional-third passed' result;

-- CASE invalid-counts-and-duplicates
begin;
create temporary table feed_test as select gen_random_uuid() s,array_agg(id order by id) u from (select id from public.profiles order by id limit 5) p;
insert into public.stables(id,name) select s,'Isolated third holiday feeding test' from feed_test;
insert into public.memberships(stable_id,user_id,role,active) select s,u[1],'owner',true from feed_test union all select s,person,'rider',true from feed_test,unnest(u[2:4]) person;
grant select on feed_test to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select u[1]::text from feed_test),true);
do $$ declare c record;n int;owners uuid[];begin
 select * into c from feed_test;
 for n in 1..4 loop
  owners:=case n when 1 then array[c.u[2]] when 2 then array[c.u[2],c.u[2]] when 3 then array[c.u[2],null] else c.u[2:4] end;
  begin perform public.save_holiday_feeding(c.s,'2027-03-25',owners,array[c.u[2]],c.u[2:3],'{}');raise exception 'Invalid morning accepted';exception when raise_exception then if sqlerrm not like 'Velg % forskjellige personer%' then raise;end if;end;
 end loop;
 begin perform public.save_holiday_feeding(c.s,'2027-03-25',c.u[2:3],c.u[2:3],c.u[2:3],'{}');raise exception 'Two lunch owners accepted';exception when raise_exception then if sqlerrm not like 'Velg % forskjellige personer%' then raise;end if;end;
 assert not exists(select 1 from public.feeding_shifts where stable_id=c.s),'Invalid plan wrote rows';
end $$;
rollback;
select 'invalid-counts-and-duplicates passed' result;

-- CASE holiday-boundary-and-constraints
begin;
create temporary table feed_test as select gen_random_uuid() s,array_agg(id order by id) u from (select id from public.profiles order by id limit 5) p;
insert into public.stables(id,name) select s,'Isolated third holiday feeding test' from feed_test;
insert into public.memberships(stable_id,user_id,role,active) select s,u[1],'owner',true from feed_test union all select s,person,'rider',true from feed_test,unnest(u[2:4]) person;
grant select on feed_test to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select u[1]::text from feed_test),true);
do $$ declare c record;d date;n int;begin
 select * into c from feed_test;
 foreach d in array array['2026-10-18','2026-03-29']::date[] loop
  begin perform public.save_holiday_feeding(c.s,d,c.u[2:3],array[c.u[2]],c.u[2:3],'{}');raise exception 'Sunday accepted';exception when raise_exception then if sqlerrm not like 'Velg en hellig%' then raise;end if;end;
 end loop;
 for n in 1..3 loop
  begin
   insert into public.feeding_shifts(stable_id,shift_date,shift_time,label,assigned_to,meal,meal_slot) values(c.s,'2026-12-25','23:59:59','Test',c.u[2],case when n=3 then null else 'lunch' end,case when n=1 then 3 else 2 end);
   raise exception 'Invalid meal slot accepted';
  exception when check_violation then null;end;
 end loop;
 perform public.save_holiday_feeding(c.s,'2026-04-05',c.u[2:3],array[c.u[2]],c.u[2:3],'{}');
 assert (select count(*) from public.feeding_shifts where stable_id=c.s)=5,'Easter Sunday excluded';
end $$;
rollback;
select 'holiday-boundary-and-constraints passed' result;

-- CASE active-members-only
begin;
create temporary table feed_test as select gen_random_uuid() s,array_agg(id order by id) u from (select id from public.profiles order by id limit 5) p;
insert into public.stables(id,name) select s,'Isolated third holiday feeding test' from feed_test;
insert into public.memberships(stable_id,user_id,role,active) select s,u[1],'owner',true from feed_test union all select s,person,'rider',true from feed_test,unnest(u[2:4]) person;
grant select on feed_test to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select u[1]::text from feed_test),true);
do $$ declare c record;n int;begin
 select * into c from feed_test;
 update public.memberships set active=false where stable_id=c.s and user_id=c.u[4];
 for n in 4..5 loop
  begin perform public.save_holiday_feeding(c.s,'2027-03-25',c.u[2:3],array[c.u[n]],c.u[2:3],'{}');raise exception 'Inactive/foreign person accepted';exception when raise_exception then if sqlerrm not like 'Velg aktive personer%' then raise;end if;end;
 end loop;
 assert not exists(select 1 from public.feeding_shifts where stable_id=c.s),'Rejected plan wrote rows';
end $$;
rollback;
select 'active-members-only passed' result;

-- CASE stale-and-older-clients
begin;
create temporary table feed_test as select gen_random_uuid() s,array_agg(id order by id) u from (select id from public.profiles order by id limit 5) p;
insert into public.stables(id,name) select s,'Isolated third holiday feeding test' from feed_test;
insert into public.memberships(stable_id,user_id,role,active) select s,u[1],'owner',true from feed_test union all select s,person,'rider',true from feed_test,unnest(u[2:4]) person;
grant select on feed_test to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select u[1]::text from feed_test),true);
do $$ declare c record;ids uuid[];begin
 select * into c from feed_test;
 perform public.save_holiday_feeding(c.s,'2027-03-25',c.u[2:3],array[c.u[4]],c.u[2:3],'{}');
 select array_agg(id order by id) into ids from public.feeding_shifts where stable_id=c.s;
 begin perform public.save_holiday_feeding(c.s,'2027-03-25',c.u[2:3],array[c.u[2]],c.u[2:3],'{}');raise exception 'Stale save accepted';exception when raise_exception then if sqlerrm not like 'Fôringene er endret.%' then raise;end if;end;
 begin perform public.save_daily_feeding(c.s,'2027-03-25',c.u[2],c.u[3],ids);raise exception 'Old app changed holiday';exception when raise_exception then if sqlerrm not like 'Helligdager må fordeles%' then raise;end if;end;
 assert (select array_agg(id order by id) from public.feeding_shifts where stable_id=c.s)=ids,'Failed save changed rows';
end $$;
rollback;
select 'stale-and-older-clients passed' result;

-- CASE member-read-and-admin-write
begin;
create temporary table feed_test as select gen_random_uuid() s,array_agg(id order by id) u from (select id from public.profiles order by id limit 5) p;
insert into public.stables(id,name) select s,'Isolated third holiday feeding test' from feed_test;
insert into public.memberships(stable_id,user_id,role,active) select s,u[1],'owner',true from feed_test union all select s,person,'rider',true from feed_test,unnest(u[2:4]) person;
grant select on feed_test to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select u[1]::text from feed_test),true);
do $$ declare c record;begin
 select * into c from feed_test;
 perform public.save_holiday_feeding(c.s,'2027-03-25',c.u[2:3],array[c.u[4]],c.u[2:3],'{}');
 perform set_config('request.jwt.claim.sub',c.u[4]::text,true);
 assert (select count(*) from public.feeding_shifts where stable_id=c.s)=5,'Member cannot read plan';
 begin perform public.save_holiday_feeding(c.s,'2027-05-17',c.u[2:3],array[c.u[4]],c.u[2:3],'{}');raise exception 'Rider wrote plan';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',c.u[5]::text,true);
 assert not exists(select 1 from public.feeding_shifts where stable_id=c.s),'Foreign user read plan';
 begin perform public.save_holiday_feeding(c.s,'2027-05-17',c.u[2:3],array[c.u[4]],c.u[2:3],'{}');raise exception 'Foreign user wrote plan';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'member-read-and-admin-write passed' result;

-- CASE legacy-conversion-and-ordinary-days
begin;
create temporary table feed_test as select gen_random_uuid() s,array_agg(id order by id) u from (select id from public.profiles order by id limit 5) p;
insert into public.stables(id,name) select s,'Isolated third holiday feeding test' from feed_test;
insert into public.memberships(stable_id,user_id,role,active) select s,u[1],'owner',true from feed_test union all select s,person,'rider',true from feed_test,unnest(u[2:4]) person;
grant select on feed_test to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select u[1]::text from feed_test),true);
do $$ declare c record;ids uuid[];begin
 select * into c from feed_test;
 insert into public.feeding_shifts(stable_id,shift_date,shift_time,label,assigned_to,daily_slot) values(c.s,'2026-12-25','23:59:59','Felles ansvar: morgen, lunsj og kveld',c.u[2],1),(c.s,'2026-12-25','23:59:59','Felles ansvar: morgen, lunsj og kveld',c.u[3],2);
 select array_agg(id) into ids from public.feeding_shifts where stable_id=c.s;
 perform public.save_holiday_feeding(c.s,'2026-12-25',c.u[2:3],array[c.u[4]],c.u[2:3],ids);
 assert (select count(*) from public.feeding_shifts where stable_id=c.s and daily_slot is null)=5,'Legacy conversion failed';
 perform public.save_daily_feeding(c.s,'2026-10-18',c.u[2],c.u[3],'{}');
 assert (select count(*) from public.feeding_shifts where stable_id=c.s and shift_date='2026-10-18' and daily_slot is not null)=2,'Ordinary Sunday changed';
end $$;
rollback;
select 'legacy-conversion-and-ordinary-days passed' result;
