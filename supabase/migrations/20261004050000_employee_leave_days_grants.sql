-- PostgREST returns "permission denied for table employee_leave_days" when the
-- caller is anon (account login without a Supabase Auth session) or when only
-- a column-level UPDATE was granted. Table privileges and anon policies match
-- the rest of the HR app. Updates may change status only.

grant select, insert, update on table public.employee_leave_days to anon, authenticated;

create or replace function public.set_employee_leave_day_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile record;
begin
  if auth.uid() is not null then
    select u.id, u.name,
           coalesce(nullif(to_jsonb(u)->>'company_id', ''), 'speego-original') as company_id
      into profile
    from public.users u
    where u.auth_user_id = auth.uid()
    limit 1;
  else
    select u.id, u.name,
           coalesce(nullif(to_jsonb(u)->>'company_id', ''), 'speego-original') as company_id
      into profile
    from public.users u
    where u.id = new.employee_id
    limit 1;
  end if;

  if profile.id is null then
    raise exception 'Không tìm thấy hồ sơ nhân sự cho tài khoản đăng nhập' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(profile.name, '')), '') is null then
    raise exception 'Hồ sơ nhân sự chưa có họ tên' using errcode = '23514';
  end if;

  new.employee_id := profile.id;
  new.employee_name := profile.name;
  new.company_id := profile.company_id;
  return new;
end;
$$;

revoke all on function public.set_employee_leave_day_identity() from public;
grant execute on function public.set_employee_leave_day_identity() to anon, authenticated;

create or replace function public.protect_employee_leave_day_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status is distinct from 'pending' or new.status is distinct from 'approved' then
    raise exception 'Chỉ được duyệt ngày nghỉ đang chờ' using errcode = '42501';
  end if;

  new.id := old.id;
  new.company_id := old.company_id;
  new.employee_id := old.employee_id;
  new.employee_name := old.employee_name;
  new.leave_date := old.leave_date;
  new.reason := old.reason;
  new.created_at := old.created_at;
  return new;
end;
$$;

revoke all on function public.protect_employee_leave_day_update() from public;
grant execute on function public.protect_employee_leave_day_update() to anon, authenticated;

drop trigger if exists employee_leave_days_protect_update on public.employee_leave_days;
create trigger employee_leave_days_protect_update
  before update on public.employee_leave_days
  for each row execute function public.protect_employee_leave_day_update();

drop policy if exists "employee_leave_days_select_anon" on public.employee_leave_days;
drop policy if exists "employee_leave_days_insert_anon" on public.employee_leave_days;
drop policy if exists "employee_leave_days_update_anon" on public.employee_leave_days;

create policy "employee_leave_days_select_anon"
  on public.employee_leave_days for select to anon
  using (true);

create policy "employee_leave_days_insert_anon"
  on public.employee_leave_days for insert to anon
  with check (true);

create policy "employee_leave_days_update_anon"
  on public.employee_leave_days for update to anon
  using (status = 'pending')
  with check (status = 'approved');
