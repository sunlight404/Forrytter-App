begin;
do $$
declare admin_id uuid;rider_id uuid;stable uuid;shift uuid;affected integer;
begin
select id into admin_id from public.profiles order by id limit 1;
select id into rider_id from public.profiles where id<>admin_id order by id limit 1;
if rider_id is null then raise exception 'Two profiles required';end if;
insert into public.stables(name) values('Rollback feeding deletion test') returning id into stable;
insert into public.memberships(stable_id,user_id,role) values(stable,admin_id,'owner'),(stable,rider_id,'rider');
insert into public.feeding_shifts(stable_id,shift_date,shift_time,label,assigned_to,created_by) values(stable,'2099-01-03','08:00','Morgenfôring',rider_id,admin_id) returning id into shift;
perform set_config('request.jwt.claim.sub',rider_id::text,true);execute 'set local role authenticated';
delete from public.feeding_shifts where id=shift;get diagnostics affected=row_count;
if affected<>0 then raise exception 'Rider deleted feeding';end if;
perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
delete from public.feeding_shifts where id=shift;get diagnostics affected=row_count;
if affected<>0 then raise exception 'Nonmember deleted feeding';end if;
perform set_config('request.jwt.claim.sub',admin_id::text,true);
delete from public.feeding_shifts where id=shift;get diagnostics affected=row_count;
if affected<>1 then raise exception 'Admin failed to delete feeding';end if;
end;$$;rollback;
