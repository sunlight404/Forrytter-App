-- Additive upgrade of the existing production schema. Extra tasks keep NULL links.
alter table public.tasks
  add column assignment_id uuid references public.horse_assignments(id) on delete cascade,
  add column standard_task_key smallint,
  add constraint tasks_standard_assignment_check check (
    (assignment_id is null and standard_task_key is null) or
    (assignment_id is not null and standard_task_key is not null and standard_task_key between 1 and 4)
  ),
  add constraint tasks_assignment_standard_unique unique (assignment_id, standard_task_key);

-- Existing horse_assignments_user_date_idx already supports the next-horse lookup.
create index feeding_shifts_user_date_time_idx on public.feeding_shifts(stable_id,assigned_to,shift_date,shift_time);
create index tasks_user_date_idx on public.tasks(stable_id,assigned_to,task_date);

-- Invoker rights preserve the existing admin-only assignment and task policies.
create function public.create_assignment_standard_tasks() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and
    (OLD.stable_id,OLD.user_id,OLD.horse_id,OLD.assignment_date) is distinct from
    (NEW.stable_id,NEW.user_id,NEW.horse_id,NEW.assignment_date) then
    -- Only generated tasks are replaced. Extra tasks stay with their original horse/date.
    delete from public.tasks where assignment_id = NEW.id;
  end if;
  insert into public.tasks(stable_id,assigned_to,horse_id,task_date,title,assignment_id,standard_task_key)
  select NEW.stable_id,NEW.user_id,NEW.horse_id,NEW.assignment_date,v.title,NEW.id,v.key
  from (values (1,'Møkke ute og inne'),(2,'Fylle vann ute og inne'),
    (3,'Gjøre i stand kraftfôr'),(4,'Smøre utstyr')) as v(key,title)
  on conflict (assignment_id,standard_task_key) do nothing;
  return NEW;
end;
$$;
revoke all on function public.create_assignment_standard_tasks() from public,anon,authenticated;
create trigger assignment_standard_tasks after insert or update on public.horse_assignments
for each row execute function public.create_assignment_standard_tasks();

-- A rider may change completion only, not move an assigned task or alter its identity.
create function public.validate_task_identity() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and auth.uid() is not null and not public.is_admin(OLD.stable_id) then
    if (to_jsonb(NEW) - 'completed' - 'completed_at') is distinct from
       (to_jsonb(OLD) - 'completed' - 'completed_at') then
      raise exception 'Only task completion may be changed by the assigned rider' using errcode='42501';
    end if;
  end if;
  if NEW.assignment_id is not null and not exists (
    select 1 from public.horse_assignments a where a.id=NEW.assignment_id
    and a.stable_id=NEW.stable_id and a.user_id=NEW.assigned_to
    and a.horse_id=NEW.horse_id and a.assignment_date=NEW.task_date
  ) then
    raise exception 'Standard task must match its horse assignment' using errcode='23514';
  end if;
  return NEW;
end;
$$;
revoke all on function public.validate_task_identity() from public,anon,authenticated;
create trigger validate_task_identity before insert or update on public.tasks
for each row execute function public.validate_task_identity();

-- Backfill today and future assignments only; never rewrite historical or extra tasks.
insert into public.tasks(stable_id,assigned_to,horse_id,task_date,title,assignment_id,standard_task_key)
select a.stable_id,a.user_id,a.horse_id,a.assignment_date,v.title,a.id,v.key
from public.horse_assignments a cross join
  (values (1,'Møkke ute og inne'),(2,'Fylle vann ute og inne'),
    (3,'Gjøre i stand kraftfôr'),(4,'Smøre utstyr')) as v(key,title)
where a.assignment_date >= (now() at time zone 'Europe/Oslo')::date
on conflict (assignment_id,standard_task_key) do nothing;
