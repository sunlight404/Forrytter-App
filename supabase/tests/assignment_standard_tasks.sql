-- Run against the upgraded existing database. All fixtures roll back.
begin;
do $$
declare
  admin_id uuid; rider_id uuid; stable uuid; horse1 uuid; horse2 uuid;
  assignment uuid; extra uuid; task uuid; changed integer;
begin
  select id into admin_id from public.profiles order by id limit 1;
  select id into rider_id from public.profiles where id <> admin_id order by id limit 1;
  if rider_id is null then raise exception 'Test requires two existing profiles'; end if;
  insert into public.stables(name) values ('Rollback-only test stable') returning id into stable;
  insert into public.memberships(stable_id,user_id,role) values (stable,admin_id,'owner'),(stable,rider_id,'rider');
  insert into public.horses(stable_id,name) values(stable,'Test horse A') returning id into horse1;
  insert into public.horses(stable_id,name) values(stable,'Test horse B') returning id into horse2;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  execute 'set local role authenticated';
  insert into public.horse_assignments(stable_id,user_id,horse_id,assignment_date)
    values(stable,rider_id,horse1,'2099-01-03') returning id into assignment;
  if (select count(*) from public.tasks where assignment_id=assignment) <> 5 then raise exception 'Expected five tasks'; end if;
  insert into public.tasks(stable_id,assigned_to,horse_id,task_date,title)
    values(stable,rider_id,horse1,'2099-01-03','Keep this extra task') returning id into extra;
  select id into task from public.tasks where assignment_id=assignment and standard_task_key=5;

  perform set_config('request.jwt.claim.sub',rider_id::text,true);
  update public.tasks set completed=true,completed_at=now() where id=task;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Rider could not check task'; end if;
  if (select count(*) from public.tasks where assignment_id=assignment and completed) <> 1 then raise exception 'Completion is not independent'; end if;
  begin
    update public.tasks set title='Not allowed' where id=task;
    raise exception 'Rider changed task identity';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.horse_assignments(stable_id,user_id,horse_id,assignment_date)
      values(stable,rider_id,horse1,'2099-01-04');
    raise exception 'Rider created assignment';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  update public.tasks set completed=false where id=task;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Nonmember updated task'; end if;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  insert into public.horse_assignments(stable_id,user_id,horse_id,assignment_date)
    values(stable,rider_id,horse1,'2099-01-03')
    on conflict(stable_id,assignment_date,user_id) do update set horse_id=excluded.horse_id;
  if (select count(*) from public.tasks where assignment_id=assignment) <> 5 then raise exception 'Duplicate tasks'; end if;
  if not (select completed from public.tasks where id=task) then raise exception 'Completion lost on repeated save'; end if;
  update public.horse_assignments set horse_id=horse2 where id=assignment;
  if (select count(*) from public.tasks where assignment_id=assignment and horse_id=horse2 and not completed) <> 5 then raise exception 'Replacement did not reset tasks'; end if;
  if not exists(select 1 from public.tasks where id=extra and horse_id=horse1) then raise exception 'Extra task altered'; end if;
  delete from public.horse_assignments where id=assignment;
  if exists(select 1 from public.tasks where assignment_id=assignment) then raise exception 'Generated tasks orphaned'; end if;
  if not exists(select 1 from public.tasks where id=extra) then raise exception 'Extra task deleted'; end if;
end;
$$;
rollback;
