-- Remove stable access without deleting the account or historical records.
create function public.guard_membership_changes() returns trigger
language plpgsql security invoker set search_path='' as $$
declare actor_owner boolean;
begin
  if auth.uid() is null then
    if TG_OP='DELETE' then return OLD; else return NEW; end if;
  end if;
  if TG_OP='DELETE' then raise exception 'Deactivate membership to preserve history' using errcode='42501'; end if;
  select exists(select 1 from public.memberships where stable_id=NEW.stable_id and user_id=auth.uid() and active and role='owner') into actor_owner;
  if TG_OP='INSERT' then
    if NEW.role<>'rider' and not actor_owner then raise exception 'Only owner may grant administrator access' using errcode='42501'; end if;
    return NEW;
  end if;
  if (NEW.stable_id,NEW.user_id) is distinct from (OLD.stable_id,OLD.user_id) then raise exception 'Membership identity cannot change' using errcode='42501'; end if;
  if (NEW.active,NEW.role) is distinct from (OLD.active,OLD.role) then
    if OLD.role='owner' or NEW.role='owner' then raise exception 'Owner membership is protected' using errcode='42501'; end if;
    if NEW.user_id=auth.uid() and not NEW.active then raise exception 'Cannot remove yourself' using errcode='42501'; end if;
    if not actor_owner and (OLD.role<>'rider' or NEW.role<>OLD.role) then raise exception 'Only owner may manage administrators' using errcode='42501'; end if;
  end if;
  return NEW;
end;
$$;
revoke all on function public.guard_membership_changes() from public,anon,authenticated;
create trigger guard_membership_changes before insert or update or delete on public.memberships for each row execute function public.guard_membership_changes();

create function public.cleanup_departed_member() returns trigger
language plpgsql security invoker set search_path='' as $$
declare today_oslo date := (now() at time zone 'Europe/Oslo')::date;
begin
  if OLD.active and not NEW.active then
    update public.recurring_horse_assignments set active=false where stable_id=NEW.stable_id and user_id=NEW.user_id and active;
    update public.horse_assignments a set is_cancelled=true,recurring_id=null
      where stable_id=NEW.stable_id and user_id=NEW.user_id and assignment_date>=today_oslo and not is_cancelled
      and not exists(select 1 from public.tasks t where t.stable_id=a.stable_id and t.assigned_to=a.user_id and t.horse_id=a.horse_id and t.task_date=a.assignment_date and t.completed);
    update public.feeding_shifts set assigned_to=null
      where stable_id=NEW.stable_id and assigned_to=NEW.user_id
      and (shift_date+shift_time)>=(now() at time zone 'Europe/Oslo');
    update public.feeding_swap_requests set status='declined',admin_decided_at=now(),admin_decided_by=auth.uid()
      where stable_id=NEW.stable_id and (from_user=NEW.user_id or to_user=NEW.user_id) and status in ('pending','awaiting_admin');
    update public.join_requests set status='declined' where stable_id=NEW.stable_id and user_id=NEW.user_id;
  end if;
  return NEW;
end;
$$;
revoke all on function public.cleanup_departed_member() from public,anon,authenticated;
create trigger cleanup_departed_member after update on public.memberships for each row execute function public.cleanup_departed_member();
