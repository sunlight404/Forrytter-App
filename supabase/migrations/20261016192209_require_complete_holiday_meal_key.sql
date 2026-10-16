alter table public.feeding_shifts drop constraint holiday_meal_slot_check;
alter table public.feeding_shifts add constraint holiday_meal_slot_check check(
 (meal is null and meal_slot is null) or
 (meal is not null and meal in('morning','lunch','evening') and meal_slot is not null and daily_slot is null
 and public.is_feeding_holiday(shift_date) and meal_slot between 1 and case when meal='lunch' then 1 else 2 end)
);
