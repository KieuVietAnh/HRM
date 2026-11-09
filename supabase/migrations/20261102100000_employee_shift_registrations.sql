-- Đăng ký ca làm việc theo tuần: mỗi dòng là ca nhân viên đăng ký cho một ngày.
-- Nhân viên gửi (pending), HR/admin duyệt hoặc từ chối. Quyền HR được kiểm tra
-- ở giao diện, giống employee_leave_days (đăng nhập tài khoản dùng anon key).
create table if not exists public.employee_shift_registrations (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  employee_id uuid not null references public.users (id) on delete cascade,
  employee_name text not null,
  work_date date not null,
  shift_id text not null,
  shift_name text not null,
  start_time text,
  end_time text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_registrations_company_nonempty check (btrim(company_id) <> ''),
  constraint shift_registrations_shift_nonempty check (btrim(shift_id) <> '' and btrim(shift_name) <> ''),
  constraint shift_registrations_status_check check (status in ('pending', 'approved', 'rejected')),
  constraint shift_registrations_unique_day unique (company_id, employee_id, work_date)
);

create index if not exists shift_registrations_company_date_idx
  on public.employee_shift_registrations (company_id, work_date desc);

-- Tên và công ty luôn lấy từ hồ sơ nhân sự, không tin dữ liệu từ form.
create or replace function public.set_shift_registration_identity()
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
  new.status := 'pending';
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_shift_registration_identity() from public;
grant execute on function public.set_shift_registration_identity() to anon, authenticated;

drop trigger if exists shift_registrations_identity on public.employee_shift_registrations;
create trigger shift_registrations_identity
  before insert on public.employee_shift_registrations
  for each row execute function public.set_shift_registration_identity();

-- Cập nhật: đổi ca (chỉ khi chưa duyệt, đưa về pending) hoặc đổi trạng thái
-- pending -> approved/rejected. Không đổi được người, công ty, ngày.
create or replace function public.protect_shift_registration_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  shift_changed boolean :=
    new.shift_id is distinct from old.shift_id
    or new.shift_name is distinct from old.shift_name
    or new.start_time is distinct from old.start_time
    or new.end_time is distinct from old.end_time;
begin
  new.id := old.id;
  new.company_id := old.company_id;
  new.employee_id := old.employee_id;
  new.employee_name := old.employee_name;
  new.work_date := old.work_date;
  new.created_at := old.created_at;
  new.updated_at := now();

  if shift_changed then
    if old.status = 'approved' then
      raise exception 'Ca đã được duyệt, không thể sửa' using errcode = '42501';
    end if;
    new.status := 'pending';
  elsif new.status is distinct from old.status then
    -- pending -> approved/rejected (HR), rejected -> pending (gửi lại cùng ca).
    if not (
      (old.status = 'pending' and new.status in ('approved', 'rejected'))
      or (old.status = 'rejected' and new.status = 'pending')
    ) then
      raise exception 'Chỉ được duyệt hoặc từ chối ca đang chờ' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_shift_registration_update() from public;
grant execute on function public.protect_shift_registration_update() to anon, authenticated;

drop trigger if exists shift_registrations_protect_update on public.employee_shift_registrations;
create trigger shift_registrations_protect_update
  before update on public.employee_shift_registrations
  for each row execute function public.protect_shift_registration_update();

alter table public.employee_shift_registrations enable row level security;
grant select, insert, update, delete on table public.employee_shift_registrations to anon, authenticated;

drop policy if exists "shift_registrations_select" on public.employee_shift_registrations;
drop policy if exists "shift_registrations_insert" on public.employee_shift_registrations;
drop policy if exists "shift_registrations_update" on public.employee_shift_registrations;
drop policy if exists "shift_registrations_delete" on public.employee_shift_registrations;

create policy "shift_registrations_select"
  on public.employee_shift_registrations for select to anon, authenticated
  using (true);

create policy "shift_registrations_insert"
  on public.employee_shift_registrations for insert to anon, authenticated
  with check (true);

create policy "shift_registrations_update"
  on public.employee_shift_registrations for update to anon, authenticated
  using (true)
  with check (true);

-- Chỉ xóa được ca chưa duyệt (nhân viên bỏ đăng ký một ngày).
create policy "shift_registrations_delete"
  on public.employee_shift_registrations for delete to anon, authenticated
  using (status <> 'approved');
