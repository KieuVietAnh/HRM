-- Ghi nhận từng ngày nghỉ của tài khoản đang đăng nhập.
-- Tách khỏi đơn xin nghỉ phép và dữ liệu chấm công hiện có.
create table if not exists public.employee_leave_days (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  employee_id uuid not null references public.users (id) on delete cascade,
  employee_name text not null,
  leave_date date not null,
  created_at timestamptz not null default now(),
  constraint employee_leave_days_company_nonempty check (btrim(company_id) <> ''),
  constraint employee_leave_days_name_nonempty check (btrim(employee_name) <> ''),
  constraint employee_leave_days_unique_date unique (company_id, employee_id, leave_date)
);

create index if not exists employee_leave_days_company_date_idx
  on public.employee_leave_days (company_id, leave_date desc);

-- Tên, mã nhân sự và công ty đều lấy từ hồ sơ Supabase Auth; dữ liệu form
-- không thể ghi tên hoặc công ty của người khác.
create or replace function public.set_employee_leave_day_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile record;
begin
  select u.id, u.name,
         coalesce(nullif(to_jsonb(u)->>'company_id', ''), 'speego-original') as company_id
    into profile
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;

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

revoke all on function public.set_employee_leave_day_identity() from public, anon;
grant execute on function public.set_employee_leave_day_identity() to authenticated;

drop trigger if exists employee_leave_days_identity on public.employee_leave_days;
create trigger employee_leave_days_identity
  before insert on public.employee_leave_days
  for each row execute function public.set_employee_leave_day_identity();

alter table public.employee_leave_days enable row level security;
revoke all on table public.employee_leave_days from anon;
grant select, insert on table public.employee_leave_days to authenticated;

drop policy if exists "employee_leave_days_select" on public.employee_leave_days;
drop policy if exists "employee_leave_days_insert_own" on public.employee_leave_days;

create policy "employee_leave_days_select"
  on public.employee_leave_days for select to authenticated
  using (
    company_id = public.current_leave_company_id()
    and (
      employee_id = public.current_hr_profile_id()
      or public.current_hr_role() in ('admin', 'hr')
    )
  );

create policy "employee_leave_days_insert_own"
  on public.employee_leave_days for insert to authenticated
  with check (
    company_id = public.current_leave_company_id()
    and employee_id = public.current_hr_profile_id()
  );
