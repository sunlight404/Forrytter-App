begin;
do $$
declare a uuid;b uuid;st uuid;ids uuid[];n integer;
begin
select id into a from public.profiles order by id limit 1;
select id into b from public.profiles where id<>a order by id limit 1;
insert into public.stables(name) values('Rollback daily feeding test') returning id into st;
insert into public.memberships(stable_id,user_id,role) values(st,a,'owner'),(st,b,'rider');
perform set_config('request.jwt.claim.sub',a::text,true);execute 'set local role authenticated';
perform public.save_daily_feeding(st,'2099-01-03',a,b);
select count(*) into n from public.feeding_shifts where stable_id=st and daily_slot in(1,2);
if n<>2 then raise exception 'Expected two people';end if;
if exists(select 1 from public.feeding_shifts where stable_id=st and (label<>'Felles ansvar: morgen, lunsj og kveld' or shift_time<>'23:59:59')) then raise exception 'Not full-day responsibility';end if;
begin
perform public.save_daily_feeding(st,'2099-01-03',a,b);
raise exception using errcode='XX000',message='Stale write permitted';
exception when raise_exception then null;end;
select array_agg(id) into ids from public.feeding_shifts where stable_id=st;
begin
perform public.save_daily_feeding(st,'2099-01-03',a,a,ids);
raise exception using errcode='XX000',message='Same person permitted twice';
exception when raise_exception then null;end;
perform public.save_daily_feeding(st,'2099-01-03',b,a,ids);
if (select count(*) from public.feeding_shifts where stable_id=st)<>2 then raise exception 'Replacement duplicated slots';end if;
perform set_config('request.jwt.claim.sub',b::text,true);
if (select count(*) from public.feeding_shifts where stable_id=st and assigned_to=b)<>1 then raise exception 'Rider cannot see own full-day assignment';end if;
begin
perform public.save_daily_feeding(st,'2099-01-04',a,b);
raise exception using errcode='XX000',message='Rider saved day';
exception when insufficient_privilege then null;end;
end;$$;rollback;
