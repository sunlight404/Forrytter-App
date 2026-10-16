alter table public.feeding_shifts drop constraint feeding_shifts_daily_slot_check;
alter table public.feeding_shifts add constraint feeding_shifts_daily_slot_check check(daily_slot in(1,2,3));
alter table public.feeding_shifts add constraint feeding_third_holiday_check check(daily_slot<>3 or public.is_feeding_holiday(shift_date));
