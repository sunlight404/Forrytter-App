alter table public.memberships add column archived boolean not null default false;
alter table public.memberships add constraint archived_member_inactive check(not archived or (not active and role<>'owner'));
create policy admins_read_former_profiles on public.profiles for select to authenticated using (
 exists(select 1 from public.memberships former where former.user_id=profiles.id and public.is_admin(former.stable_id))
);
