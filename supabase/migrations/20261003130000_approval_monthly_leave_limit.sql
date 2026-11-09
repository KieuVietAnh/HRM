-- Return the number of pending/approved paid-leave requests overlapping a month.
create or replace function public.my_approval_leave_month_usage(p_year integer, p_month integer)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_employee_id uuid := public.current_hr_profile_id();
  v_company text := public.current_leave_company_id();
  v_start date;
  v_end date;
  v_used integer;
begin
  if v_employee_id is null then raise exception 'Tài khoản chưa liên kết hồ sơ nhân sự.'; end if;
  if p_year < 2000 or p_year > 2100 or p_month < 1 or p_month > 12 then
    raise exception 'Tháng phép không hợp lệ.';
  end if;
  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + interval '1 month')::date;
  select count(*)::integer into v_used
  from public.hr_records r
  where r.collection = 'approvalRequests'
    and r.data->>'requesterId' = v_employee_id::text
    and coalesce(nullif(r.data->>'companyId', ''), 'speego-original') = v_company
    and r.data->>'status' in ('pending', 'approved')
    and (r.data->>'templateId' = 'leave' or r.data->>'attendanceSync' = 'paid-leave')
    and coalesce(r.data->>'leaveType', 'paid') = 'paid'
    and r.data->>'leaveStartDate' ~ '^\d{4}-\d{2}-\d{2}$'
    and r.data->>'leaveEndDate' ~ '^\d{4}-\d{2}-\d{2}$'
    and (r.data->>'leaveStartDate')::date < v_end
    and (r.data->>'leaveEndDate')::date >= v_start;
  return jsonb_build_object('year', p_year, 'month', p_month, 'used', v_used,
    'limit', 2, 'remaining', greatest(0, 2 - v_used));
end;
$$;

revoke all on function public.my_approval_leave_month_usage(integer, integer) from public, anon;
grant execute on function public.my_approval_leave_month_usage(integer, integer) to authenticated;

-- Enforce the monthly limit inside the database too. The profile row lock keeps
-- two simultaneous submissions by the same employee from exceeding the limit.
create or replace function public.enforce_approval_monthly_paid_leave_limit()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_employee_id uuid := public.current_hr_profile_id();
  v_locked_id uuid;
  v_company text;
  v_start date;
  v_end date;
  v_month date;
  v_used integer;
begin
  if new.collection <> 'approvalRequests'
    or new.data->>'status' <> 'pending'
    or not (new.data->>'templateId' = 'leave' or new.data->>'attendanceSync' = 'paid-leave')
    or coalesce(new.data->>'leaveType', 'paid') <> 'paid'
    or public.current_hr_role() <> 'user' then
    return new;
  end if;

  if v_employee_id is null or new.data->>'requesterId' <> v_employee_id::text then
    raise exception 'Nhân sự chỉ được gửi đề xuất nghỉ cho chính mình.';
  end if;
  if coalesce(new.data->>'leaveStartDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(new.data->>'leaveEndDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Ngày nghỉ không hợp lệ.';
  end if;

  select id into v_locked_id from public.users
  where id = v_employee_id and auth_user_id = auth.uid()
  for update;
  if v_locked_id is null then raise exception 'Không xác thực được hồ sơ nhân sự.'; end if;

  v_company := coalesce(nullif(new.data->>'companyId', ''), 'speego-original');
  v_start := (new.data->>'leaveStartDate')::date;
  v_end := (new.data->>'leaveEndDate')::date;
  if v_end < v_start then raise exception 'Khoảng ngày nghỉ không hợp lệ.'; end if;

  for v_month in
    select generate_series(date_trunc('month', v_start::timestamp),
      date_trunc('month', v_end::timestamp), interval '1 month')::date
  loop
    select count(*)::integer into v_used
    from public.hr_records r
    where r.collection = 'approvalRequests'
      and r.data->>'requesterId' = v_employee_id::text
      and coalesce(nullif(r.data->>'companyId', ''), 'speego-original') = v_company
      and r.data->>'status' in ('pending', 'approved')
      and (r.data->>'templateId' = 'leave' or r.data->>'attendanceSync' = 'paid-leave')
      and coalesce(r.data->>'leaveType', 'paid') = 'paid'
      and r.data->>'leaveStartDate' ~ '^\d{4}-\d{2}-\d{2}$'
      and r.data->>'leaveEndDate' ~ '^\d{4}-\d{2}-\d{2}$'
      and (r.data->>'leaveStartDate')::date < (v_month + interval '1 month')::date
      and (r.data->>'leaveEndDate')::date >= v_month;
    if v_used >= 2 then
      raise exception 'Tháng %/% đã đủ 2 lần sử dụng phép năm.',
        extract(month from v_month)::integer, extract(year from v_month)::integer;
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.enforce_approval_monthly_paid_leave_limit() from public, anon, authenticated;
drop trigger if exists approval_monthly_paid_leave_limit on public.hr_records;
create trigger approval_monthly_paid_leave_limit
  before insert on public.hr_records
  for each row execute function public.enforce_approval_monthly_paid_leave_limit();
