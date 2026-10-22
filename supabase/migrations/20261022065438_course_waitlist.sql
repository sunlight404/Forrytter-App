create table public.course_waitlist (
  id bigint generated always as identity primary key,
  stable_id uuid not null references public.stables(id),
  rider_name text not null check (length(btrim(rider_name)) between 1 and 120),
  info text not null default '' check (length(info) <= 2000),
  course text not null check (length(btrim(course)) between 1 and 200),
  created_at timestamptz not null default now()
);
create index course_waitlist_stable_order_idx on public.course_waitlist(stable_id, id);
alter table public.course_waitlist enable row level security;
revoke all on public.course_waitlist from anon, authenticated;
grant select, delete on public.course_waitlist to authenticated;
grant insert(stable_id, rider_name, info, course) on public.course_waitlist to authenticated;
grant usage on sequence public.course_waitlist_id_seq to authenticated;
create policy course_waitlist_admin_read on public.course_waitlist for select to authenticated using (public.is_admin(stable_id));
create policy course_waitlist_admin_add on public.course_waitlist for insert to authenticated with check (public.is_admin(stable_id));
create policy course_waitlist_admin_remove on public.course_waitlist for delete to authenticated using (public.is_admin(stable_id));
