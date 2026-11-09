-- Lý do ngày nghỉ từ Đề xuất luôn là "Nghỉ có phép", kể cả khi dòng đã tồn tại.

create or replace function public.protect_employee_leave_day_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.leave_day_approval_sync', true), '') = '1' then
    new.id := old.id;
    new.company_id := old.company_id;
    new.employee_id := old.employee_id;
    new.employee_name := old.employee_name;
    new.leave_date := old.leave_date;
    new.created_at := old.created_at;
    new.reason := 'Nghỉ có phép';
    new.status := case when old.status = 'pending' then 'approved' else old.status end;
    return new;
  end if;

  if old.status is distinct from 'pending' or new.status is distinct from 'approved' then
    raise exception 'Chỉ được duyệt ngày nghỉ đang chờ' using errcode = '42501';
  end if;

  new.id := old.id;
  new.company_id := old.company_id;
  new.employee_id := old.employee_id;
  new.employee_name := old.employee_name;
  new.leave_date := old.leave_date;
  new.created_at := old.created_at;
  if new.reason is distinct from 'Nghỉ có phép' then
    new.reason := old.reason;
  end if;
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
    values (v_company, v_employee, v_name, v_date, 'Nghỉ có phép', 'approved')
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
