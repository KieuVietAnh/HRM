-- Cấu hình phép riêng cho từng nhân sự và công ty. Chạy sau migration xác thực nhân sự.
create table if not exists public.employee_leave_settings (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  employee_id uuid not null references public.users (id) on delete cascade,
  leave_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_leave_settings_company_employee_key unique (company_id, employee_id),
  constraint employee_leave_settings_data_object check (jsonb_typeof(leave_data) = 'object'),
  constraint employee_leave_settings_company_nonempty check (btrim(company_id) <> '')
);

create index if not exists employee_leave_settings_company_idx
  on public.employee_leave_settings (company_id);

drop trigger if exists employee_leave_settings_set_updated_at on public.employee_leave_settings;
create trigger employee_leave_settings_set_updated_at
  before update on public.employee_leave_settings
  for each row execute function public.set_updated_at();

-- Bản triển khai hiện tại chưa có cột company_id trên users: hồ sơ cũ thuộc
-- speego-original. Khi cột này có mặt, chính sách tự dùng giá trị của hồ sơ.
create or replace function public.current_leave_company_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(to_jsonb(u)->>'company_id', ''), 'speego-original')
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.leave_employee_in_company(p_employee_id uuid, p_company_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = p_employee_id
      and coalesce(nullif(to_jsonb(u)->>'company_id', ''), 'speego-original') = p_company_id
  )
$$;

revoke all on function public.current_leave_company_id() from public, anon;
revoke all on function public.leave_employee_in_company(uuid, text) from public, anon;
grant execute on function public.current_leave_company_id() to authenticated;
grant execute on function public.leave_employee_in_company(uuid, text) to authenticated;

alter table public.employee_leave_settings enable row level security;
revoke all on table public.employee_leave_settings from anon;
grant select, insert, update on table public.employee_leave_settings to authenticated;

drop policy if exists "employee_leave_settings_select_staff" on public.employee_leave_settings;
drop policy if exists "employee_leave_settings_insert_staff" on public.employee_leave_settings;
drop policy if exists "employee_leave_settings_update_staff" on public.employee_leave_settings;

create policy "employee_leave_settings_select_staff"
  on public.employee_leave_settings for select to authenticated
  using (
    public.current_hr_role() in ('admin', 'hr')
    and company_id = public.current_leave_company_id()
    and public.leave_employee_in_company(employee_id, company_id)
  );

create policy "employee_leave_settings_insert_staff"
  on public.employee_leave_settings for insert to authenticated
  with check (
    public.current_hr_role() in ('admin', 'hr')
    and company_id = public.current_leave_company_id()
    and public.leave_employee_in_company(employee_id, company_id)
  );

create policy "employee_leave_settings_update_staff"
  on public.employee_leave_settings for update to authenticated
  using (
    public.current_hr_role() in ('admin', 'hr')
    and company_id = public.current_leave_company_id()
    and public.leave_employee_in_company(employee_id, company_id)
  )
  with check (
    public.current_hr_role() in ('admin', 'hr')
    and company_id = public.current_leave_company_id()
    and public.leave_employee_in_company(employee_id, company_id)
  );
