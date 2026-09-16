create table public.horse_swap_requests (
 id uuid primary key default gen_random_uuid(),
 stable_id uuid not null references public.stables(id) on delete cascade,
 from_user uuid not null references public.profiles(id),
 to_user uuid not null references public.profiles(id),
 -- Snapshot references deliberately survive replacement/deletion of a dated assignment.
 from_assignment_id uuid not null,
 to_assignment_id uuid not null,
 from_snapshot jsonb not null default '{}',
 to_snapshot jsonb not null default '{}',
 from_name text not null default '', to_name text not null default '',
 from_horse_name text not null default '', to_horse_name text not null default '',
 status text not null default 'pending' check(status in ('pending','awaiting_admin','approved','declined','cancelled')),
 created_at timestamptz not null default now(), responded_at timestamptz, decided_at timestamptz,
 decided_by uuid references public.profiles(id),
 check(from_user<>to_user), check(from_assignment_id<>to_assignment_id)
);
alter table public.horse_swap_requests enable row level security;
revoke all on public.horse_swap_requests from anon;
grant select,insert,update on public.horse_swap_requests to authenticated;
create policy horse_swaps_read on public.horse_swap_requests for select to authenticated
 using(public.is_member(stable_id) and (from_user=auth.uid() or to_user=auth.uid() or public.is_admin(stable_id)));
create policy horse_swaps_insert on public.horse_swap_requests for insert to authenticated
 with check(public.is_member(stable_id) and from_user=auth.uid());
create policy horse_swaps_update on public.horse_swap_requests for update to authenticated
 using(public.is_member(stable_id) and (from_user=auth.uid() or to_user=auth.uid() or public.is_admin(stable_id)))
 with check(public.is_member(stable_id) and (from_user=auth.uid() or to_user=auth.uid() or public.is_admin(stable_id)));
create index horse_swaps_stable_status_idx on public.horse_swap_requests(stable_id,status,created_at);
create index horse_swaps_from_idx on public.horse_swap_requests(from_user);
create index horse_swaps_to_idx on public.horse_swap_requests(to_user);
create index horse_swaps_decider_idx on public.horse_swap_requests(decided_by);
create unique index horse_swaps_pending_pair_idx on public.horse_swap_requests
 (least(from_assignment_id,to_assignment_id),greatest(from_assignment_id,to_assignment_id)) where status in ('pending','awaiting_admin');

create function public.validate_and_apply_horse_swap() returns trigger
language plpgsql security invoker set search_path='' as $$
declare a public.horse_assignments; b public.horse_assignments; admin_actor boolean;
begin
 admin_actor := public.is_admin(NEW.stable_id);
 if TG_OP='INSERT' then
   if NEW.status<>'pending' or NEW.from_user is distinct from auth.uid() then
     raise exception 'En forespørsel må sendes av rytteren og vente på mottaker' using errcode='42501'; end if;
 else
   if (to_jsonb(NEW)-'status'-'responded_at'-'decided_at'-'decided_by') is distinct from
      (to_jsonb(OLD)-'status'-'responded_at'-'decided_at'-'decided_by') then
     raise exception 'Innholdet i en sendt forespørsel kan ikke endres' using errcode='42501'; end if;
   if not (
     (OLD.status='pending' and NEW.status='awaiting_admin' and auth.uid()=OLD.to_user) or
     (OLD.status in ('pending','awaiting_admin') and NEW.status='declined' and (auth.uid()=OLD.to_user or admin_actor)) or
     (OLD.status in ('pending','awaiting_admin') and NEW.status='cancelled' and auth.uid()=OLD.from_user) or
     (OLD.status='awaiting_admin' and NEW.status='approved' and admin_actor)
   ) then raise exception 'Byttet krever først mottakerens og deretter admins godkjenning' using errcode='42501'; end if;
   NEW.responded_at := OLD.responded_at; NEW.decided_at := OLD.decided_at; NEW.decided_by := OLD.decided_by;
   if NEW.status='awaiting_admin' then NEW.responded_at:=now(); end if;
   if NEW.status in ('approved','declined','cancelled') then NEW.decided_at:=now();NEW.decided_by:=auth.uid(); end if;
   if NEW.status in ('declined','cancelled') then return NEW; end if;
 end if;
 -- Consistent lock order prevents two overlapping approvals swapping a day twice.
 if TG_OP='UPDATE' and NEW.status='approved' then
   perform id from public.horse_assignments where id in(NEW.from_assignment_id,NEW.to_assignment_id) order by id for update;
 end if;
 select * into a from public.horse_assignments where id=NEW.from_assignment_id;
 select * into b from public.horse_assignments where id=NEW.to_assignment_id;
 if a.id is null or b.id is null or a.stable_id<>NEW.stable_id or b.stable_id<>NEW.stable_id
   or a.user_id<>NEW.from_user or b.user_id<>NEW.to_user or a.is_cancelled or b.is_cancelled
   or a.assignment_date<(now() at time zone 'Europe/Oslo')::date or b.assignment_date<(now() at time zone 'Europe/Oslo')::date then
   raise exception 'En av hestedagene er endret, avlyst eller passert. Send en ny forespørsel'; end if;
 if (a.horse_id,a.assignment_date)=(b.horse_id,b.assignment_date) then raise exception 'Velg forskjellige hester eller datoer'; end if;
 if not exists(select 1 from public.memberships where stable_id=NEW.stable_id and user_id=a.user_id and active)
   or not exists(select 1 from public.memberships where stable_id=NEW.stable_id and user_id=b.user_id and active)
   or not exists(select 1 from public.horses where id=a.horse_id and stable_id=NEW.stable_id and active)
   or not exists(select 1 from public.horses where id=b.horse_id and stable_id=NEW.stable_id and active) then
   raise exception 'Begge ryttere og hester må være aktive i stallen'; end if;
 if TG_OP='INSERT' then
   NEW.from_snapshot:=to_jsonb(a);NEW.to_snapshot:=to_jsonb(b);
   select coalesce(full_name,'Fôrrytter') into NEW.from_name from public.profiles where id=a.user_id;
   select coalesce(full_name,'Fôrrytter') into NEW.to_name from public.profiles where id=b.user_id;
   select name into NEW.from_horse_name from public.horses where id=a.horse_id;
   select name into NEW.to_horse_name from public.horses where id=b.horse_id;
   NEW.created_at:=now();NEW.responded_at:=null;NEW.decided_at:=null;NEW.decided_by:=null;
 else
   if to_jsonb(a) is distinct from OLD.from_snapshot or to_jsonb(b) is distinct from OLD.to_snapshot then
     raise exception 'Hest, dato eller trening er endret siden forespørselen ble sendt. Avslå og send en ny forespørsel'; end if;
 end if;
 if exists(select 1 from public.horse_assignments x where x.stable_id=NEW.stable_id and x.id not in(a.id,b.id)
   and ((x.user_id=a.user_id and x.assignment_date=b.assignment_date) or (x.user_id=b.user_id and x.assignment_date=a.assignment_date))) then
   raise exception 'En av rytterne har allerede en registrering på den nye datoen. Be admin avklare datoen først'; end if;
 if TG_OP='UPDATE' and NEW.status='approved' then
   perform id from public.tasks where stable_id=NEW.stable_id and
     ((assigned_to=a.user_id and horse_id=a.horse_id and task_date=a.assignment_date) or
      (assigned_to=b.user_id and horse_id=b.horse_id and task_date=b.assignment_date)) order by id for update;
 end if;
 if exists(select 1 from public.tasks where stable_id=NEW.stable_id and completed and
     ((assigned_to=a.user_id and horse_id=a.horse_id and task_date=a.assignment_date) or
      (assigned_to=b.user_id and horse_id=b.horse_id and task_date=b.assignment_date))) then
   raise exception 'En av hestedagene har utførte oppgaver og kan ikke byttes'; end if;
 if TG_OP='UPDATE' and NEW.status='approved' then
   -- Extra tasks follow their horse/date. Standard tasks are regenerated by the existing trigger.
   update public.tasks set assigned_to=case when assigned_to=a.user_id then b.user_id else a.user_id end
     where assignment_id is null and stable_id=NEW.stable_id and
     ((assigned_to=a.user_id and horse_id=a.horse_id and task_date=a.assignment_date) or
      (assigned_to=b.user_id and horse_id=b.horse_id and task_date=b.assignment_date));
   update public.horse_assignments set horse_id=b.horse_id,assignment_date=b.assignment_date,training_text=b.training_text,recurring_id=null where id=a.id;
   update public.horse_assignments set horse_id=a.horse_id,assignment_date=a.assignment_date,training_text=a.training_text,recurring_id=null where id=b.id;
   -- Keep the original dates blocked so a recurring agreement does not regenerate them.
   if a.assignment_date<>b.assignment_date then
     insert into public.horse_assignments(stable_id,user_id,horse_id,assignment_date,is_cancelled,created_by)
       values(a.stable_id,a.user_id,a.horse_id,a.assignment_date,true,auth.uid()),
             (b.stable_id,b.user_id,b.horse_id,b.assignment_date,true,auth.uid())
       on conflict(stable_id,assignment_date,user_id) do nothing;
   end if;
 end if;
 return NEW;
end;
$$;
revoke all on function public.validate_and_apply_horse_swap() from public,anon,authenticated;
create trigger validate_and_apply_horse_swap before insert or update on public.horse_swap_requests
 for each row execute function public.validate_and_apply_horse_swap();

create function public.decline_departed_horse_swaps() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if OLD.active and not NEW.active then
  update public.horse_swap_requests set status='declined' where stable_id=NEW.stable_id
    and (from_user=NEW.user_id or to_user=NEW.user_id) and status in('pending','awaiting_admin');
 end if;
 return NEW;
end;
$$;
revoke all on function public.decline_departed_horse_swaps() from public,anon,authenticated;
create trigger decline_departed_horse_swaps after update on public.memberships
 for each row execute function public.decline_departed_horse_swaps();
