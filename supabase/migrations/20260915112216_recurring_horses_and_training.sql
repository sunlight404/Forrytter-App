-- Recurring weekend agreements use ISO week numbers (Monday-based, including week 53).
create table public.recurring_horse_assignments (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid not null references public.stables(id),
  user_id uuid not null references public.profiles(id),
  horse_id uuid not null references public.horses(id),
  week_parity smallint not null check (week_parity in (0,1)),
  weekday smallint not null check (weekday in (6,7)),
  start_date date not null default (now() at time zone 'Europe/Oslo')::date,
  training_text text not null default '' check (length(training_text)<=4000),
  active boolean not null default true,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique(stable_id,user_id,week_parity,weekday)
);
alter table public.recurring_horse_assignments enable row level security;
grant select,insert,update on public.recurring_horse_assignments to authenticated;
revoke all on public.recurring_horse_assignments from anon;
create policy recurring_read on public.recurring_horse_assignments for select to authenticated
  using (public.is_member(stable_id));
create policy recurring_insert on public.recurring_horse_assignments for insert to authenticated
  with check (public.is_admin(stable_id));
create policy recurring_update on public.recurring_horse_assignments for update to authenticated
  using (public.is_admin(stable_id)) with check (public.is_admin(stable_id));
create index recurring_horse_idx on public.recurring_horse_assignments(horse_id);
create index recurring_user_idx on public.recurring_horse_assignments(user_id);
create index recurring_creator_idx on public.recurring_horse_assignments(created_by);

alter table public.horse_assignments
  add column training_text text not null default '' check (length(training_text)<=4000),
  add column recurring_id uuid references public.recurring_horse_assignments(id),
  add column is_cancelled boolean not null default false;
create index horse_assignments_recurring_idx on public.horse_assignments(recurring_id);

create schema if not exists private;
grant usage on schema private to authenticated;
-- No privilege elevation: table RLS applies when an admin saves an agreement.
-- The daily job runs as postgres and maintains a rolling year of concrete dates.
create function private.materialize_horse_agreement(agreement_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare r public.recurring_horse_assignments; first_day date;
begin
  select * into r from public.recurring_horse_assignments where id=agreement_id and active;
  if not found then return; end if;
  if not exists(select 1 from public.horses where id=r.horse_id and stable_id=r.stable_id and active)
    or not exists(select 1 from public.memberships where user_id=r.user_id and stable_id=r.stable_id and active)
    then return; end if;
  first_day := greatest(r.start_date,(now() at time zone 'Europe/Oslo')::date);
  insert into public.horse_assignments(stable_id,user_id,horse_id,assignment_date,training_text,recurring_id,created_by)
  select r.stable_id,r.user_id,r.horse_id,first_day+n,r.training_text,r.id,r.created_by
  from generate_series(0,366) as n
  where extract(isodow from first_day+n)::int=r.weekday
    and mod(extract(week from first_day+n)::int,2)=r.week_parity
  on conflict(stable_id,assignment_date,user_id) do nothing;
end;
$$;
revoke all on function private.materialize_horse_agreement(uuid) from public,anon;
grant execute on function private.materialize_horse_agreement(uuid) to authenticated;

create function public.validate_horse_agreement() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='UPDATE' and (OLD.stable_id,OLD.user_id,OLD.week_parity,OLD.weekday) is distinct from
     (NEW.stable_id,NEW.user_id,NEW.week_parity,NEW.weekday) then
    raise exception 'Stop the old agreement before changing rider, week parity or weekday';
  end if;
  if NEW.active and (
    not exists(select 1 from public.horses where id=NEW.horse_id and stable_id=NEW.stable_id and active)
    or not exists(select 1 from public.memberships where user_id=NEW.user_id and stable_id=NEW.stable_id and active)
  ) then raise exception 'Choose an active horse and rider from this stable' using errcode='23514'; end if;
  return NEW;
end;
$$;
revoke all on function public.validate_horse_agreement() from public,anon,authenticated;
create trigger validate_horse_agreement before insert or update on public.recurring_horse_assignments
for each row execute function public.validate_horse_agreement();

create function public.sync_horse_agreement() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='UPDATE' and (OLD.horse_id,OLD.start_date,OLD.active) is distinct from
      (NEW.horse_id,NEW.start_date,NEW.active) then
    -- Retain historical/completed days, individual overrides and cancellation markers.
    delete from public.horse_assignments a where a.recurring_id=NEW.id
      and a.assignment_date >= (now() at time zone 'Europe/Oslo')::date and not a.is_cancelled
      and not exists(select 1 from public.tasks t where t.stable_id=a.stable_id
        and t.assigned_to=a.user_id and t.horse_id=a.horse_id and t.task_date=a.assignment_date and t.completed);
  end if;
  if NEW.active then
    update public.horse_assignments a set training_text=NEW.training_text
      where a.recurring_id=NEW.id and a.horse_id=NEW.horse_id and not a.is_cancelled
      and a.assignment_date >= greatest(NEW.start_date,(now() at time zone 'Europe/Oslo')::date)
      and not exists(select 1 from public.tasks t where t.stable_id=a.stable_id
        and t.assigned_to=a.user_id and t.horse_id=a.horse_id and t.task_date=a.assignment_date and t.completed);
    perform private.materialize_horse_agreement(NEW.id);
  end if;
  return NEW;
end;
$$;
revoke all on function public.sync_horse_agreement() from public,anon,authenticated;
create trigger sync_horse_agreement after insert or update on public.recurring_horse_assignments
for each row execute function public.sync_horse_agreement();

-- Extend the existing standard-task trigger: a cancelled date has no generated checklist.
create or replace function public.create_assignment_standard_tasks() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if NEW.is_cancelled then
    delete from public.tasks where assignment_id=NEW.id;
    return NEW;
  end if;
  if TG_OP='UPDATE' and
    (OLD.stable_id,OLD.user_id,OLD.horse_id,OLD.assignment_date) is distinct from
    (NEW.stable_id,NEW.user_id,NEW.horse_id,NEW.assignment_date) then
    delete from public.tasks where assignment_id=NEW.id;
  end if;
  insert into public.tasks(stable_id,assigned_to,horse_id,task_date,title,assignment_id,standard_task_key)
  select NEW.stable_id,NEW.user_id,NEW.horse_id,NEW.assignment_date,v.title,NEW.id,v.key
  from (values (1,'Møkke ute og inne'),(2,'Fylle vann ute og inne'),
    (3,'Gjøre i stand kraftfôr'),(4,'Smøre utstyr')) as v(key,title)
  on conflict(assignment_id,standard_task_key) do nothing;
  return NEW;
end;
$$;
revoke all on function public.create_assignment_standard_tasks() from public,anon,authenticated;

create extension if not exists pg_cron;
select cron.schedule('forrytter-recurring-horse-dates','15 2 * * *',
  $job$select private.materialize_horse_agreement(id) from public.recurring_horse_assignments where active;$job$);
