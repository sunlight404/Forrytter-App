create policy "admins delete feeding shifts" on public.feeding_shifts for delete to authenticated using (public.is_admin(stable_id));
grant delete on public.feeding_shifts to authenticated;
