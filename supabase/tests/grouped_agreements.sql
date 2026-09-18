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
  perform public.save_recurring_agreement_group(stable,rider_id,horse1,array[0,1],array[6,7],'2099-01-03','Tur');
  if (select count(*) from public.recurring_horse_assignments where stable_id=stable and active)<>4 then raise exception 'Expected four slots';end if;
  perform public.save_recurring_agreement_group(stable,rider_id,horse1,array[0],array[6],'2099-01-03','Trav',array(select id from public.recurring_horse_assignments where stable_id=stable));
  if (select count(*) from public.recurring_horse_assignments where stable_id=stable and active)<>1 then raise exception 'Removed slots still active';end if;
  if exists(select 1 from public.horse_assignments where stable_id=stable and training_text<>'Trav') then raise exception 'Training not updated';end if;
  perform set_config('request.jwt.claim.sub',rider_id::text,true);
  begin
    perform public.save_recurring_agreement_group(stable,rider_id,horse1,array[1],array[7],'2099-01-03','Not allowed');
    raise exception 'Rider saved agreement';
  exception when insufficient_privilege then null;end;
end;$$;rollback;
