begin;
do $$
declare owner_id uuid;rider uuid;stable uuid;h1 uuid;h2 uuid;a uuid;b uuid;req uuid;rule uuid;extra1 uuid;extra2 uuid;d date;pair_date date;i int;
begin
 select id into owner_id from public.profiles order by id limit 1;
 select id into rider from public.profiles where id<>owner_id order by id limit 1;
 if rider is null then raise exception 'Two existing profiles required';end if;
 insert into public.stables(name) values('Rollback horse swaps test') returning id into stable;
 insert into public.memberships(stable_id,user_id,role) values(stable,owner_id,'owner'),(stable,rider,'rider');
 insert into public.horses(stable_id,name) values(stable,'Horse A') returning id into h1;
 insert into public.horses(stable_id,name) values(stable,'Horse B') returning id into h2;
 select day::date into d from generate_series(current_date+14,current_date+22,'1 day') day where extract(isodow from day)=6 order by day limit 1;
 insert into public.horse_assignments(stable_id,user_id,horse_id,assignment_date,training_text) values(stable,rider,h1,d,'Training A') returning id into a;
 insert into public.horse_assignments(stable_id,user_id,horse_id,assignment_date,training_text) values(stable,owner_id,h2,d+1,'Training B') returning id into b;
 insert into public.recurring_horse_assignments(stable_id,user_id,horse_id,start_date,weekday,week_parity) values(stable,rider,h1,d,6,mod(extract(week from d)::int,2)) returning id into rule;
 update public.horse_assignments set recurring_id=rule where id=a;
 insert into public.tasks(stable_id,assigned_to,horse_id,task_date,title) values(stable,rider,h1,d,'Extra A') returning id into extra1;
 insert into public.tasks(stable_id,assigned_to,horse_id,task_date,title) values(stable,owner_id,h2,d+1,'Extra B') returning id into extra2;
 perform set_config('request.jwt.claim.sub',rider::text,true);execute 'set local role authenticated';
 insert into public.horse_swap_requests(stable_id,from_user,to_user,from_assignment_id,to_assignment_id) values(stable,rider,owner_id,a,b) returning id into req;
 begin update public.horse_swap_requests set status='approved' where id=req;raise exception 'Rider approved' using errcode='XX000';exception when insufficient_privilege then null;end;
 begin update public.horse_swap_requests set to_name='Tampered' where id=req;raise exception 'Snapshot modified' using errcode='XX000';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 begin update public.horse_swap_requests set status='approved' where id=req;raise exception 'Admin skipped receiver' using errcode='XX000';exception when insufficient_privilege then null;end;
 begin insert into public.horse_swap_requests(stable_id,from_user,to_user,from_assignment_id,to_assignment_id) values(stable,owner_id,rider,b,a);raise exception 'Duplicate reverse request allowed' using errcode='XX000';exception when unique_violation then null;end;
 update public.horse_swap_requests set status='awaiting_admin' where id=req;
 if(select horse_id from public.horse_assignments where id=a)<>h1 then raise exception 'Receiver changed assignments';end if;
 update public.horse_swap_requests set status='approved' where id=req;
 if not exists(select 1 from public.horse_assignments where id=a and user_id=rider and assignment_date=d+1 and horse_id=h2 and training_text='Training B' and recurring_id is null) then raise exception 'First swap incorrect';end if;
 if not exists(select 1 from public.horse_assignments where id=b and user_id=owner_id and assignment_date=d and horse_id=h1 and training_text='Training A') then raise exception 'Second swap incorrect';end if;
 if(select count(*) from public.tasks where assignment_id in(a,b))<>10 then raise exception 'Expected ten standard tasks';end if;
 if(select assigned_to from public.tasks where id=extra1)<>owner_id or (select assigned_to from public.tasks where id=extra2)<>rider then raise exception 'Extra tasks did not follow horse/date';end if;
 perform private.materialize_horse_agreement(rule);
 if exists(select 1 from public.horse_assignments where stable_id=stable and user_id=rider and assignment_date=d and not is_cancelled) then raise exception 'Recurring date regenerated';end if;
 if not(select active from public.recurring_horse_assignments where id=rule) then raise exception 'Fixed agreement altered';end if;
 begin update public.horse_swap_requests set status='approved' where id=req;raise exception 'Approved twice' using errcode='XX000';exception when insufficient_privilege then null;end;
 -- Independent same-day swaps, stale training, completed tasks and departure cancellation.
 for i in 1..4 loop
  pair_date:=d+400+i;
  insert into public.horse_assignments(stable_id,user_id,horse_id,assignment_date) values(stable,rider,h1,pair_date) returning id into a;
  insert into public.horse_assignments(stable_id,user_id,horse_id,assignment_date) values(stable,owner_id,h2,pair_date) returning id into b;
  perform set_config('request.jwt.claim.sub',rider::text,true);
  insert into public.horse_swap_requests(stable_id,from_user,to_user,from_assignment_id,to_assignment_id) values(stable,rider,owner_id,a,b) returning id into req;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  update public.horse_swap_requests set status='awaiting_admin' where id=req;
  if i=1 then
   update public.horse_swap_requests set status='approved' where id=req;
   if(select horse_id from public.horse_assignments where id=a)<>h2 or (select horse_id from public.horse_assignments where id=b)<>h1 then raise exception 'Same-day swap failed';end if;
  elsif i=2 then
   update public.horse_assignments set training_text='Changed after acceptance' where id=a;
   begin update public.horse_swap_requests set status='approved' where id=req;raise exception 'Stale approval allowed' using errcode='XX000';exception when raise_exception then null;end;
   if(select horse_id from public.horse_assignments where id=a)<>h1 then raise exception 'Partial swap despite error';end if;
   update public.horse_swap_requests set status='declined' where id=req;
  elsif i=3 then
   perform set_config('request.jwt.claim.sub',rider::text,true);
   update public.tasks set completed=true,completed_at=now() where assignment_id=a and standard_task_key=5;
   perform set_config('request.jwt.claim.sub',owner_id::text,true);
   begin update public.horse_swap_requests set status='approved' where id=req;raise exception 'Completed task swapped' using errcode='XX000';exception when raise_exception then null;end;
   update public.horse_swap_requests set status='declined' where id=req;
  else
   update public.memberships set active=false where stable_id=stable and user_id=rider;
   if(select status from public.horse_swap_requests where id=req)<>'declined' then raise exception 'Departed user retains pending request';end if;
  end if;
 end loop;
end;
$$;
rollback;
