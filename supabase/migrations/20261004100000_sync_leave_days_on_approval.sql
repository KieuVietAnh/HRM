-- Khi đơn nghỉ trên trang Đề xuất được duyệt, các ngày tương ứng ở Ngày nghỉ phép
-- chuyển thành Đã duyệt. Ngày chưa có thì được tạo ở trạng thái đã duyệt.

create or replace function public.set_employee_leave_day_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile record;
begin
  if coalesce(current_setting('app.leave_day_approval_sync', true), '') = '1' then
    return new;
  end if;

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

create or replace function public.sync_approved_leave_request_days()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee uuid;
  v_name text;
  v_company text;
  v_reason text;
  v_date date;
  v_end date;
begin
  if to_regclass('public.employee_leave_days') is null then
    return new;
  end if;
  if new.collection is distinct from 'approvalRequests' then
    return new;
  end if;
  if new.data->>'status' is distinct from 'approved' or old.data->>'status' = 'approved' then
    return new;
  end if;
  if not (
    new.data->>'templateId' = 'leave'
    or new.data->>'attendanceSync' = 'paid-leave'
    or coalesce(new.data->>'leaveStartDate', '') <> ''
  ) then
    return new;
  end if;
  if coalesce(new.data->>'leaveStartDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(new.data->>'leaveEndDate', new.data->>'leaveStartDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
    or new.data->>'requesterId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return new;
  end if;

  v_employee := (new.data->>'requesterId')::uuid;
  select btrim(name) into v_name from public.users where id = v_employee;
  if nullif(v_name, '') is null then
    return new;
  end if;

  v_company := coalesce(nullif(new.data->>'companyId', ''), 'speego-original');
  v_reason := 'Nghỉ có phép';
  v_date := (new.data->>'leaveStartDate')::date;
  v_end := coalesce((new.data->>'leaveEndDate')::date, v_date);
  if v_end < v_date or v_end > v_date + 366 then
    return new;
  end if;

  perform set_config('app.leave_day_approval_sync', '1', true);
  while v_date <= v_end loop
    insert into public.employee_leave_days (
      company_id, employee_id, employee_name, leave_date, reason, status
    )
    values (v_company, v_employee, v_name, v_date, v_reason, 'approved')
    on conflict (company_id, employee_id, leave_date) do update
      set status = 'approved',
          reason = 'Nghỉ có phép'
      where public.employee_leave_days.status = 'pending'
         or public.employee_leave_days.reason is distinct from 'Nghỉ có phép';
    v_date := v_date + 1;
  end loop;

  return new;
end;
$$;

revoke all on function public.sync_approved_leave_request_days() from public;
grant execute on function public.sync_approved_leave_request_days() to anon, authenticated;

drop trigger if exists hr_records_sync_leave_days on public.hr_records;
create trigger hr_records_sync_leave_days
  after update on public.hr_records
  for each row
  execute function public.sync_approved_leave_request_days();
