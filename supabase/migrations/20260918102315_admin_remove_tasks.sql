create or replace function public.create_assignment_standard_tasks() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if NEW.is_cancelled then
    delete from public.tasks where assignment_id=NEW.id;
    return NEW;
  end if;
  if TG_OP='UPDATE' then
    if not OLD.is_cancelled and
      (OLD.stable_id,OLD.user_id,OLD.horse_id,OLD.assignment_date) is not distinct from
      (NEW.stable_id,NEW.user_id,NEW.horse_id,NEW.assignment_date) then
      return NEW;
    end if;
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
