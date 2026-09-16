-- Isolated fixtures; exercises real authenticated RLS and rolls back all changes.
begin;
do $$
declare
  owner_id uuid; rider uuid; stable uuid; h1 uuid; h2 uuid; rule uuid;
  manual uuid; done_day uuid; cancelled uuid; extra uuid; n int; changed int;
  first_date date; date2 date;
begin
  select id into owner_id from public.profiles order by id limit 1;
  select id into rider from public.profiles where id<>owner_id order by id limit 1;
  if rider is null then raise exception 'Two existing profiles required'; end if;
  insert into public.stables(name) values('Rollback recurring test') returning id into stable;
  insert into public.memberships(stable_id,user_id,role) values(stable,owner_id,'owner'),(stable,rider,'rider');
  insert into public.horses(stable_id,name) values(stable,'Test A') returning id into h1;
  insert into public.horses(stable_id,name) values(stable,'Test B') returning id into h2;
  select d::date into first_date from generate_series(current_date+1,current_date+20,'1 day') d
    where extract(isodow from d)=6 and mod(extract(week from d)::int,2)=0 order by d limit 1;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  execute 'set local role authenticated';
  insert into public.horse_assignments(stable_id,user_id,horse_id,assignment_date,training_text)
    values(stable,rider,h2,first_date,'Individual training') returning id into manual;
  insert into public.recurring_horse_assignments(stable_id,user_id,horse_id,week_parity,weekday,start_date,training_text)
    values(stable,rider,h1,0,6,first_date,'Easy ride') returning id into rule;
  select count(*) into n from public.horse_assignments where recurring_id=rule;
  if n<24 then raise exception 'Too few generated dates: %',n; end if;
  if exists(select 1 from public.horse_assignments where recurring_id=rule and
    (extract(isodow from assignment_date)<>6 or mod(extract(week from assignment_date)::int,2)<>0)) then raise exception 'Wrong weekday/parity'; end if;
  if (select horse_id from public.horse_assignments where id=manual)<>h2 then raise exception 'Manual date overwritten'; end if;
  if exists(select 1 from public.horse_assignments a where recurring_id=rule and
    (select count(*) from public.tasks t where t.assignment_id=a.id)<>5) then raise exception 'Missing standard tasks'; end if;
  select id,assignment_date into done_day,date2 from public.horse_assignments where recurring_id=rule order by assignment_date limit 1;
  perform set_config('request.jwt.claim.sub',rider::text,true);
  update public.tasks set completed=true,completed_at=now() where assignment_id=done_day and standard_task_key=1;
  begin
    insert into public.recurring_horse_assignments(stable_id,user_id,horse_id,week_parity,weekday) values(stable,rider,h1,1,7);
    raise exception 'Rider created agreement';
  exception when insufficient_privilege then null; end;
  update public.recurring_horse_assignments set training_text='Forbidden' where id=rule;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Rider edited agreement'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  insert into public.tasks(stable_id,assigned_to,horse_id,task_date,title) values(stable,rider,h1,date2,'Extra remains') returning id into extra;
  update public.recurring_horse_assignments set training_text='New training' where id=rule;
  if (select count(*) from public.horse_assignments where recurring_id=rule)<>n then raise exception 'Repeated save changed dates'; end if;
  if (select training_text from public.horse_assignments where id=done_day)<>'Easy ride' then raise exception 'Completed date training changed'; end if;
  if (select training_text from public.horse_assignments where id=manual)<>'Individual training' then raise exception 'Manual training changed'; end if;
  if exists(select 1 from public.horse_assignments where recurring_id=rule and id<>done_day and training_text<>'New training') then raise exception 'Training not propagated'; end if;
  select id into cancelled from public.horse_assignments where recurring_id=rule and id<>done_day order by assignment_date limit 1;
  update public.horse_assignments set is_cancelled=true,recurring_id=null where id=cancelled;
  perform private.materialize_horse_agreement(rule);
  if not (select is_cancelled from public.horse_assignments where id=cancelled) then raise exception 'Cancellation lost'; end if;
  if exists(select 1 from public.tasks where assignment_id=cancelled) then raise exception 'Cancelled checklist remains'; end if;
  insert into public.recurring_horse_assignments(stable_id,user_id,horse_id,week_parity,weekday,start_date)
    values(stable,rider,h1,0,7,first_date),(stable,rider,h1,1,6,first_date),(stable,rider,h1,1,7,first_date);
  if (select count(*) from public.recurring_horse_assignments where stable_id=stable)<>4 then raise exception 'Both days and parities missing'; end if;
  if exists(select 1 from public.horse_assignments a join public.recurring_horse_assignments r on r.id=a.recurring_id
    where a.stable_id=stable and (extract(isodow from a.assignment_date)<>r.weekday or mod(extract(week from a.assignment_date)::int,2)<>r.week_parity)) then raise exception 'Wrong generated dates'; end if;
  update public.recurring_horse_assignments set active=false where id=rule;
  if (select count(*) from public.horse_assignments where recurring_id=rule)<>1 then raise exception 'Stop failed to preserve only completed date'; end if;
  if not exists(select 1 from public.tasks where id=extra) then raise exception 'Extra task lost'; end if;
  if not exists(select 1 from public.tasks where assignment_id=done_day and completed) then raise exception 'Completed task lost'; end if;
  if not exists(select 1 from public.horse_assignments where id=manual) then raise exception 'Manual date lost'; end if;
end;
$$;
rollback;
