-- Keep every saved assignment and its tasks; allow distinct horses on a rider's day.
alter table public.horse_assignments drop constraint horse_assignments_stable_id_assignment_date_user_id_key;
alter table public.horse_assignments add constraint horse_assignments_day_rider_horse_key unique(stable_id,assignment_date,user_id,horse_id);
do $$
declare definition text;
begin
  definition := pg_get_functiondef('private.materialize_horse_agreement(uuid)'::regprocedure);
  definition := replace(definition, 'where extract(isodow', 'where not exists(select 1 from public.horse_assignments existing where existing.stable_id=r.stable_id and existing.user_id=r.user_id and existing.assignment_date=first_day+n) and extract(isodow');
  definition := replace(definition,'on conflict(stable_id,assignment_date,user_id) do nothing','on conflict do nothing');
  execute definition;
  definition := pg_get_functiondef('public.validate_and_apply_horse_swap()'::regprocedure);
  definition := replace(definition,'on conflict(stable_id,assignment_date,user_id) do nothing','on conflict do nothing');
  execute definition;
end $$;
