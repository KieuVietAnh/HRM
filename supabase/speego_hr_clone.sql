-- =============================================================================
-- SpeeGo Logistics HR — FULL SUPABASE SETUP
-- Copy toàn bộ file này → Supabase SQL Editor → Run
-- Dùng để tạo một database HR MỚI có cấu trúc giống hệ thống hiện tại
-- File chỉ tạo cấu trúc + tài khoản admin mặc định, không copy dữ liệu nhân sự cũ
-- An toàn chạy lại nhiều lần (IF NOT EXISTS / OR REPLACE)
-- =============================================================================
-- Sau khi chạy xong:
--   Email:    admin@company.local
--   Password: 123456
--   Role:     admin
-- =============================================================================

create extension if not exists "pgcrypto";

-- =============================================================================
-- 1) BẢNG users (nhân sự + đăng nhập + vai trò + mật khẩu)
-- =============================================================================
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),

  employee_id text,
  username text,
  email text,
  password text,

  name text not null default '',
  phone text,
  branch text,
  department text,
  position text,
  employment_status text default 'Thử việc',
  status text,
  shift text,
  role text not null default 'user',

  join_date date,
  official_date date,
  dob date,

  cccd text,
  identity_issue_date date,
  identity_issue_place text,
  address text,
  hometown text,
  gender text,
  marital_status text,

  avatar_url text,
  documents jsonb not null default '[]'::jsonb,
  images jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bổ sung cột nếu bảng users đã tồn tại (schema cũ)
alter table public.users add column if not exists employee_id text;
alter table public.users add column if not exists username text;
alter table public.users add column if not exists email text;
alter table public.users add column if not exists password text;
alter table public.users add column if not exists name text;
alter table public.users add column if not exists phone text;
alter table public.users add column if not exists branch text;
alter table public.users add column if not exists department text;
alter table public.users add column if not exists position text;
alter table public.users add column if not exists employment_status text;
alter table public.users add column if not exists status text;
alter table public.users add column if not exists shift text;
alter table public.users add column if not exists role text;
alter table public.users add column if not exists join_date date;
alter table public.users add column if not exists official_date date;
alter table public.users add column if not exists dob date;
alter table public.users add column if not exists cccd text;
alter table public.users add column if not exists identity_issue_date date;
alter table public.users add column if not exists identity_issue_place text;
alter table public.users add column if not exists address text;
alter table public.users add column if not exists hometown text;
alter table public.users add column if not exists gender text;
alter table public.users add column if not exists marital_status text;
alter table public.users add column if not exists notes text;
alter table public.users add column if not exists salary_mechanism text;
alter table public.users add column if not exists total_salary text;
alter table public.users add column if not exists avatar_url text;
alter table public.users add column if not exists documents jsonb;
alter table public.users add column if not exists images jsonb;
alter table public.users add column if not exists created_at timestamptz;
alter table public.users add column if not exists updated_at timestamptz;

-- Chuẩn hoá dữ liệu null
update public.users set name = coalesce(name, '') where name is null;
update public.users set role = coalesce(nullif(btrim(role), ''), 'user') where role is null or btrim(coalesce(role, '')) = '';
update public.users set employment_status = coalesce(employment_status, 'Thử việc') where employment_status is null;
update public.users set documents = '[]'::jsonb where documents is null;
update public.users set images = '[]'::jsonb where images is null;
update public.users set created_at = coalesce(created_at, now()) where created_at is null;
update public.users set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.users alter column name set default '';
alter table public.users alter column role set default 'user';
alter table public.users alter column employment_status set default 'Thử việc';
alter table public.users alter column documents set default '[]'::jsonb;
alter table public.users alter column images set default '[]'::jsonb;
alter table public.users alter column created_at set default now();
alter table public.users alter column updated_at set default now();

-- Vai trò hợp lệ: user | hr | manager | admin
update public.users
set role = 'user'
where role is null
   or btrim(role) = ''
   or lower(role) not in ('user', 'hr', 'manager', 'admin');

update public.users set role = lower(role) where role is not null;

alter table public.users drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check
  check (role in ('user', 'hr', 'manager', 'admin'));

-- Index
create unique index if not exists users_email_unique
  on public.users (lower(email))
  where email is not null and email <> '';

create unique index if not exists users_employee_id_unique
  on public.users (employee_id)
  where employee_id is not null and employee_id <> '';

create unique index if not exists users_username_unique
  on public.users (username)
  where username is not null and username <> '';

create index if not exists users_department_idx on public.users (department);
create index if not exists users_branch_idx on public.users (branch);
create index if not exists users_employment_status_idx on public.users (employment_status);
create index if not exists users_role_idx on public.users (role);

-- Trigger updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 2) BẢNG employee_status_history
-- =============================================================================
create table if not exists public.employee_status_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.users(id) on delete set null,
  employee_code text,
  employee_name text,
  old_status text,
  new_status text,
  effective_date date,
  actor text default 'HR',
  note text,
  created_at timestamptz not null default now()
);

alter table public.employee_status_history add column if not exists employee_id uuid;
alter table public.employee_status_history add column if not exists employee_code text;
alter table public.employee_status_history add column if not exists employee_name text;
alter table public.employee_status_history add column if not exists old_status text;
alter table public.employee_status_history add column if not exists new_status text;
alter table public.employee_status_history add column if not exists effective_date date;
alter table public.employee_status_history add column if not exists actor text;
alter table public.employee_status_history add column if not exists note text;
alter table public.employee_status_history add column if not exists created_at timestamptz;

create index if not exists employee_status_history_created_at_idx
  on public.employee_status_history (created_at desc);
create index if not exists employee_status_history_employee_id_idx
  on public.employee_status_history (employee_id);

-- =============================================================================
-- 3) BẢNG performance_reviews (chấm điểm / đánh giá)
-- =============================================================================
create table if not exists public.performance_reviews (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.users(id) on delete cascade,
  month text not null,

  self_assessment jsonb not null default '{}'::jsonb,
  supervisor_assessment jsonb not null default '{}'::jsonb,
  self_comment text,
  supervisor_comment text,
  self_total_score numeric,
  self_grade text,
  supervisor_total_score numeric,
  supervisor_grade text,
  status text not null default 'draft',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.performance_reviews add column if not exists employee_id uuid;
alter table public.performance_reviews add column if not exists month text;
alter table public.performance_reviews add column if not exists self_assessment jsonb;
alter table public.performance_reviews add column if not exists supervisor_assessment jsonb;
alter table public.performance_reviews add column if not exists self_comment text;
alter table public.performance_reviews add column if not exists supervisor_comment text;
alter table public.performance_reviews add column if not exists self_total_score numeric;
alter table public.performance_reviews add column if not exists self_grade text;
alter table public.performance_reviews add column if not exists supervisor_total_score numeric;
alter table public.performance_reviews add column if not exists supervisor_grade text;
alter table public.performance_reviews add column if not exists status text;
alter table public.performance_reviews add column if not exists created_at timestamptz;
alter table public.performance_reviews add column if not exists updated_at timestamptz;

update public.performance_reviews set self_assessment = '{}'::jsonb where self_assessment is null;
update public.performance_reviews set supervisor_assessment = '{}'::jsonb where supervisor_assessment is null;
update public.performance_reviews set status = coalesce(status, 'draft') where status is null;

create unique index if not exists performance_reviews_employee_month_uidx
  on public.performance_reviews (employee_id, month);

drop trigger if exists performance_reviews_set_updated_at on public.performance_reviews;
create trigger performance_reviews_set_updated_at
  before update on public.performance_reviews
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 4) RPC đăng nhập: check_credentials(p_email, p_password)
-- App: supabase.rpc('check_credentials', { p_email, p_password })
-- =============================================================================
create or replace function public.check_credentials(p_email text, p_password text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_result json;
begin
  if p_email is null or btrim(p_email) = '' or p_password is null then
    return null;
  end if;

  select *
  into v_user
  from public.users
  where lower(email) = lower(btrim(p_email))
    and password = p_password
  limit 1;

  if not found then
    return null;
  end if;

  select json_build_object(
    'id', v_user.id,
    'employee_id', v_user.employee_id,
    'username', v_user.username,
    'email', v_user.email,
    'name', v_user.name,
    'phone', v_user.phone,
    'branch', v_user.branch,
    'department', v_user.department,
    'position', v_user.position,
    'employment_status', v_user.employment_status,
    'status', v_user.status,
    'shift', v_user.shift,
    'role', v_user.role,
    'join_date', v_user.join_date,
    'official_date', v_user.official_date,
    'dob', v_user.dob,
    'cccd', v_user.cccd,
    'identity_issue_date', v_user.identity_issue_date,
    'identity_issue_place', v_user.identity_issue_place,
    'address', v_user.address,
    'hometown', v_user.hometown,
    'gender', v_user.gender,
    'marital_status', v_user.marital_status,
    'avatar_url', v_user.avatar_url,
    'documents', v_user.documents,
    'images', v_user.images,
    'created_at', v_user.created_at,
    'updated_at', v_user.updated_at
  )
  into v_result;

  return v_result;
end;
$$;

grant execute on function public.check_credentials(text, text) to anon, authenticated, service_role;

-- =============================================================================
-- 5) QUYỀN + RLS (app dùng anon key)
-- =============================================================================
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on table public.users to anon, authenticated;
grant select, insert, update, delete on table public.employee_status_history to anon, authenticated;
grant select, insert, update, delete on table public.performance_reviews to anon, authenticated;

alter table public.users enable row level security;
alter table public.employee_status_history enable row level security;
alter table public.performance_reviews enable row level security;

drop policy if exists "users_select_anon" on public.users;
drop policy if exists "users_insert_anon" on public.users;
drop policy if exists "users_update_anon" on public.users;
drop policy if exists "users_delete_anon" on public.users;
create policy "users_select_anon" on public.users for select to anon, authenticated using (true);
create policy "users_insert_anon" on public.users for insert to anon, authenticated with check (true);
create policy "users_update_anon" on public.users for update to anon, authenticated using (true) with check (true);
create policy "users_delete_anon" on public.users for delete to anon, authenticated using (true);

drop policy if exists "esh_select_anon" on public.employee_status_history;
drop policy if exists "esh_insert_anon" on public.employee_status_history;
drop policy if exists "esh_update_anon" on public.employee_status_history;
drop policy if exists "esh_delete_anon" on public.employee_status_history;
create policy "esh_select_anon" on public.employee_status_history for select to anon, authenticated using (true);
create policy "esh_insert_anon" on public.employee_status_history for insert to anon, authenticated with check (true);
create policy "esh_update_anon" on public.employee_status_history for update to anon, authenticated using (true) with check (true);
create policy "esh_delete_anon" on public.employee_status_history for delete to anon, authenticated using (true);

drop policy if exists "pr_select_anon" on public.performance_reviews;
drop policy if exists "pr_insert_anon" on public.performance_reviews;
drop policy if exists "pr_update_anon" on public.performance_reviews;
drop policy if exists "pr_delete_anon" on public.performance_reviews;
create policy "pr_select_anon" on public.performance_reviews for select to anon, authenticated using (true);
create policy "pr_insert_anon" on public.performance_reviews for insert to anon, authenticated with check (true);
create policy "pr_update_anon" on public.performance_reviews for update to anon, authenticated using (true) with check (true);
create policy "pr_delete_anon" on public.performance_reviews for delete to anon, authenticated using (true);

-- =============================================================================
-- 6) SEED ADMIN
-- =============================================================================
insert into public.users (
  employee_id, username, email, password, name, role, employment_status, department, position
)
select
  'NV0001', 'admin', 'admin@company.local', '123456',
  'Quản trị viên', 'admin', 'Chính thức', 'Nhân sự', 'Admin'
where not exists (
  select 1 from public.users where lower(email) = lower('admin@company.local')
);

-- =============================================================================
-- 7) BẢNG hr_records — Lương / BH / Phúc lợi / Chấm công / KPI / Tasks / ...
-- Thay thế toàn bộ Firebase Realtime DB (path hr/*)
-- =============================================================================
create table if not exists public.hr_records (
  id text primary key,
  collection text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hr_records add column if not exists collection text;
alter table public.hr_records add column if not exists data jsonb;
alter table public.hr_records add column if not exists created_at timestamptz;
alter table public.hr_records add column if not exists updated_at timestamptz;

update public.hr_records set data = '{}'::jsonb where data is null;
update public.hr_records set created_at = coalesce(created_at, now()) where created_at is null;
update public.hr_records set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.hr_records alter column data set default '{}'::jsonb;
alter table public.hr_records alter column created_at set default now();
alter table public.hr_records alter column updated_at set default now();

create index if not exists hr_records_collection_idx on public.hr_records (collection);
create index if not exists hr_records_collection_updated_idx on public.hr_records (collection, updated_at desc);
create index if not exists hr_records_data_gin on public.hr_records using gin (data);

drop trigger if exists hr_records_set_updated_at on public.hr_records;
create trigger hr_records_set_updated_at
  before update on public.hr_records
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on table public.hr_records to anon, authenticated;

alter table public.hr_records enable row level security;

drop policy if exists "hr_records_select_anon" on public.hr_records;
drop policy if exists "hr_records_insert_anon" on public.hr_records;
drop policy if exists "hr_records_update_anon" on public.hr_records;
drop policy if exists "hr_records_delete_anon" on public.hr_records;

create policy "hr_records_select_anon" on public.hr_records for select to anon, authenticated using (true);
create policy "hr_records_insert_anon" on public.hr_records for insert to anon, authenticated with check (true);
create policy "hr_records_update_anon" on public.hr_records for update to anon, authenticated using (true) with check (true);
create policy "hr_records_delete_anon" on public.hr_records for delete to anon, authenticated using (true);

-- Ghi chú collection trong hr_records (tương đương path Firebase cũ):
--   attendanceLogs, attendanceAdjustments, manualWorkdays, payrolls,
--   insuranceInfo, taxInfo, dependents,
--   salaryGrades, employeeSalaries, promotionHistory,
--   kpiTemplates, employeeKPIs, kpiConversions, kpiResults,
--   tasks, taskLogs,
--   recruitmentPlans, candidates, candidateStatusLogs,
--   competencyFramework, employee_competency_assessment,
--   trainings, trainingParticipants, trainingResults,
--   approvalRequests, approvalTemplates, employee_status_history (seed/legacy)

comment on table public.hr_records is
  'Lưu toàn bộ module HR từng nằm trên Firebase (lương, BH, chấm công, KPI, tasks, tuyển dụng, phê duyệt...)';

-- =============================================================================
-- 8) KIỂM TRA NHANH (tùy chọn — bỏ comment nếu muốn xem kết quả)
-- =============================================================================
-- select id, employee_id, email, name, role from public.users;
-- select public.check_credentials('admin@company.local', '123456');
-- select collection, count(*) from public.hr_records group by collection order by 1;

-- =============================================================================
-- XONG
-- Project Settings → API → copy:
--   VITE_SUPABASE_URL=...
--   VITE_SUPABASE_ANON_KEY=...
-- Không cần Firebase nữa cho các module HR.
-- =============================================================================
