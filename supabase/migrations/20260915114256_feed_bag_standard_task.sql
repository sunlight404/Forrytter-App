-- Add the fifth standard task without resetting existing checkmarks or extra tasks.
alter table public.tasks drop constraint tasks_standard_assignment_check;
alter table public.tasks add constraint tasks_standard_assignment_check check (
 (assignment_id is null and standard_task_key is null) or
 (assignment_id is not null and standard_task_key is not null and standard_task_key between 1 and 5)
);
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
    (3,'Gjøre i stand kraftfôr'),(4,'Smøre utstyr'),(5,'Fylling av fôrposer')) as v(key,title)
  on conflict(assignment_id,standard_task_key) do nothing;
  return NEW;
end;
$$;
revoke all on function public.create_assignment_standard_tasks() from public,anon,authenticated;


insert into public.tasks(stable_id,assigned_to,horse_id,task_date,title,assignment_id,standard_task_key)
select stable_id,user_id,horse_id,assignment_date,'Fylling av fôrposer',id,5
from public.horse_assignments
where not is_cancelled and assignment_date >= (now() at time zone 'Europe/Oslo')::date
on conflict(assignment_id,standard_task_key) do nothing;
