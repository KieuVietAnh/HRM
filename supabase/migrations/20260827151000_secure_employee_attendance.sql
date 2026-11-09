-- Employee-facing authentication and attendance isolation.
-- Run only after every employee account has an auth_user_id.

create or replace function public.current_hr_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.users
  where auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.current_hr_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(role, 'user')
  from public.users
  where auth_user_id = auth.uid()
  limit 1
$$;

revoke all on function public.current_hr_profile_id() from public, anon;
revoke all on function public.current_hr_role() from public, anon;
grant execute on function public.current_hr_profile_id() to authenticated;
grant execute on function public.current_hr_role() to authenticated;

-- The legacy RPC compared public.users.password directly and did not create a
-- verifiable session. Accounts are now authenticated only by Supabase Auth.
revoke all on function public.check_credentials(text, text) from public, anon, authenticated;

alter table public.users enable row level security;

drop policy if exists "users_select_anon" on public.users;
drop policy if exists "users_insert_anon" on public.users;
drop policy if exists "users_update_anon" on public.users;
drop policy if exists "users_delete_anon" on public.users;
drop policy if exists "users_select_authenticated" on public.users;
drop policy if exists "users_insert_admin" on public.users;
drop policy if exists "users_update_admin" on public.users;
drop policy if exists "users_delete_admin" on public.users;

revoke all on table public.users from anon;
grant select, insert, update, delete on table public.users to authenticated;

create policy "users_select_authenticated"
  on public.users for select to authenticated
  using (
    auth_user_id = auth.uid()
    or public.current_hr_role() in ('admin', 'hr', 'manager')
  );

create policy "users_insert_admin"
  on public.users for insert to authenticated
  with check (public.current_hr_role() = 'admin');

create policy "users_update_admin"
  on public.users for update to authenticated
  using (public.current_hr_role() = 'admin')
  with check (public.current_hr_role() = 'admin');

create policy "users_delete_admin"
  on public.users for delete to authenticated
  using (public.current_hr_role() = 'admin');

alter table public.hr_records enable row level security;

drop policy if exists "hr_records_select_anon" on public.hr_records;
drop policy if exists "hr_records_insert_anon" on public.hr_records;
drop policy if exists "hr_records_update_anon" on public.hr_records;
drop policy if exists "hr_records_delete_anon" on public.hr_records;
drop policy if exists "hr_records_select_authenticated" on public.hr_records;
drop policy if exists "hr_records_insert_staff" on public.hr_records;
drop policy if exists "hr_records_update_staff" on public.hr_records;
drop policy if exists "hr_records_delete_staff" on public.hr_records;

revoke all on table public.hr_records from anon;
grant select, insert, update, delete on table public.hr_records to authenticated;

create policy "hr_records_select_authenticated"
  on public.hr_records for select to authenticated
  using (
    public.current_hr_role() in ('admin', 'hr', 'manager')
    or (
      collection = 'attendanceLogs'
      and data ->> 'employeeId' = public.current_hr_profile_id()::text
    )
  );

create policy "hr_records_insert_staff"
  on public.hr_records for insert to authenticated
  with check (public.current_hr_role() in ('admin', 'hr', 'manager'));

create policy "hr_records_update_staff"
  on public.hr_records for update to authenticated
  using (public.current_hr_role() in ('admin', 'hr', 'manager'))
  with check (public.current_hr_role() in ('admin', 'hr', 'manager'));

create policy "hr_records_delete_staff"
  on public.hr_records for delete to authenticated
  using (public.current_hr_role() in ('admin', 'hr', 'manager'));

-- Remove migrated legacy passwords after Auth accounts have been provisioned.
update public.users set password = null where auth_user_id is not null;
