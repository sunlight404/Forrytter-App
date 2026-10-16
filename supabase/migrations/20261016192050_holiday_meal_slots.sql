alter table public.feeding_shifts add column meal text;
alter table public.feeding_shifts add column meal_slot smallint;
alter table public.feeding_shifts add constraint holiday_meal_slot_check check(
 (meal is null and meal_slot is null) or
 (meal in('morning','lunch','evening') and meal_slot is not null and daily_slot is null
  and public.is_feeding_holiday(shift_date) and meal_slot between 1 and case when meal='lunch' then 1 else 2 end)
);
create unique index holiday_meal_slot_idx on public.feeding_shifts(stable_id,shift_date,meal,meal_slot) where meal is not null;
create unique index holiday_meal_person_idx on public.feeding_shifts(stable_id,shift_date,meal,assigned_to) where meal is not null and assigned_to is not null;
