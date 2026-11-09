-- Approval requests remain in hr_records so older proposals stay visible.
-- New employee requests are written only by RPC, with identity and team leader
-- taken from the authenticated profile instead of the browser payload.

create index if not exists hr_records_approval_requester_idx
  on public.hr_records ((data->>'requesterId'),
    (coalesce(nullif(data->>'companyId', ''), 'speego-original')))
  where collection = 'approvalRequests';

create or replace function public.my_team_leader()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_me public.users%rowtype;
  v_leader public.users%rowtype;
  v_count integer;
  v_company text;
  v_leader_id uuid;
begin
  select * into v_me from public.users where auth_user_id = auth.uid();
  if v_me.id is null then raise exception 'Tài khoản chưa liên kết hồ sơ nhân sự.'; end if;
  if nullif(btrim(v_me.department), '') is null then
    raise exception 'Hồ sơ của bạn chưa có Team/phòng ban. Vui lòng liên hệ HR.';
  end if;
  v_company := coalesce(nullif(to_jsonb(v_me)->>'company_id', ''), 'speego-original');
  select count(*), (array_agg(id order by id))[1] into v_count, v_leader_id
  from public.users u
  where u.id <> v_me.id
    and lower(btrim(u.department)) = lower(btrim(v_me.department))
    and (nullif(btrim(v_me.branch), '') is null or lower(btrim(u.branch)) = lower(btrim(v_me.branch)))
    and coalesce(nullif(to_jsonb(u)->>'company_id', ''), 'speego-original') = v_company
    and u.position ~* '(^|[^[:alpha:]])leader([^[:alpha:]]|$)'
    and u.auth_user_id is not null;
  if v_count = 0 then
    raise exception 'Team % chưa có Leader có tài khoản đăng nhập. Vui lòng liên hệ HR.', v_me.department;
  elsif v_count > 1 then
    raise exception 'Team % có nhiều Leader. Vui lòng liên hệ HR xác định một người duyệt.', v_me.department;
  end if;
  select * into v_leader from public.users where id = v_leader_id;
  return jsonb_build_object('id', v_leader.id, 'name', v_leader.name,
    'avatar', coalesce(v_leader.avatar_url, ''), 'department', v_me.department);
end;
$$;

create or replace function public.approval_leave_used(p_employee_id uuid, p_company_id text, p_year integer)
returns numeric
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(sum(case when r.data->>'leaveDuration' = 'half' then 0.5 else 1 end), 0)::numeric
  from public.hr_records r
  cross join lateral generate_series(
    case when r.data->>'leaveStartDate' ~ '^\d{4}-\d{2}-\d{2}$'
      then (r.data->>'leaveStartDate')::timestamp else null end,
    case when r.data->>'leaveEndDate' ~ '^\d{4}-\d{2}-\d{2}$'
      then (r.data->>'leaveEndDate')::timestamp else null end,
    interval '1 day'
  ) as days(day)
  where r.collection = 'approvalRequests'
    and r.data->>'requesterId' = p_employee_id::text
    and coalesce(nullif(r.data->>'companyId', ''), 'speego-original') = p_company_id
    and r.data->>'status' in ('pending', 'approved')
    and (r.data->>'templateId' = 'leave' or r.data->>'attendanceSync' = 'paid-leave')
    and coalesce(r.data->>'leaveType', 'paid') = 'paid'
    and extract(year from days.day)::integer = p_year
$$;

create or replace function public.my_approval_leave_balance(p_year integer)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_employee_id uuid := public.current_hr_profile_id();
  v_company text := public.current_leave_company_id();
  v_total numeric;
  v_used numeric;
begin
  if v_employee_id is null then raise exception 'Tài khoản chưa liên kết hồ sơ nhân sự.'; end if;
  if p_year < 2000 or p_year > 2100 then raise exception 'Năm phép không hợp lệ.'; end if;
  select (leave_data->p_year::text->>'total_leave')::numeric into v_total
  from public.employee_leave_settings
  where employee_id = v_employee_id and company_id = v_company;
  v_used := public.approval_leave_used(v_employee_id, v_company, p_year);
  return jsonb_build_object('year', p_year, 'configured', v_total is not null,
    'total', coalesce(v_total, 0), 'used', v_used,
    'remaining', coalesce(v_total, 0) - v_used);
end;
$$;

create or replace function public.submit_employee_approval(p_data jsonb)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_me public.users%rowtype;
  v_leader jsonb;
  v_company text;
  v_id text;
  v_now timestamptz := now();
  v_data jsonb;
  v_start date;
  v_end date;
  v_year integer;
  v_requested numeric;
  v_balance jsonb;
begin
  select * into v_me from public.users where auth_user_id = auth.uid() for update;
  if v_me.id is null then raise exception 'Tài khoản chưa liên kết hồ sơ nhân sự.'; end if;
  if jsonb_typeof(p_data) <> 'object' then raise exception 'Đơn đề xuất không hợp lệ.'; end if;
  if nullif(btrim(p_data->>'subject'), '') is null or nullif(btrim(p_data->>'content'), '') is null then
    raise exception 'Vui lòng nhập tiêu đề và nội dung đề xuất.';
  end if;
  v_company := coalesce(nullif(to_jsonb(v_me)->>'company_id', ''), 'speego-original');
  v_leader := public.my_team_leader();
  if (p_data->>'templateId' = 'leave' or p_data->>'attendanceSync' = 'paid-leave') then
    if coalesce(p_data->>'leaveStartDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(p_data->>'leaveEndDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Ngày nghỉ không hợp lệ.';
    end if;
    v_start := (p_data->>'leaveStartDate')::date;
    v_end := (p_data->>'leaveEndDate')::date;
    if v_end < v_start or v_end > v_start + 365 then raise exception 'Khoảng ngày nghỉ không hợp lệ.'; end if;
    if coalesce(p_data->>'leaveDuration', '') not in ('full', 'half')
      or coalesce(p_data->>'leaveType', '') not in ('paid', 'unpaid') then
      raise exception 'Loại nghỉ hoặc thời lượng không hợp lệ.';
    end if;
    if p_data->>'leaveType' = 'paid' then
      for v_year in select generate_series(extract(year from v_start)::integer, extract(year from v_end)::integer) loop
        v_requested := (least(v_end, make_date(v_year, 12, 31)) - greatest(v_start, make_date(v_year, 1, 1)) + 1)
          * case when p_data->>'leaveDuration' = 'half' then 0.5 else 1 end;
        v_balance := public.my_approval_leave_balance(v_year);
        if (v_balance->>'configured')::boolean is false then
          raise exception 'Chưa cài đặt phép năm % cho nhân sự. Vui lòng liên hệ HR.', v_year;
        end if;
        if (v_balance->>'remaining')::numeric < v_requested then
          raise exception 'Phép năm % chỉ còn % ngày; đơn cần % ngày.', v_year,
            v_balance->>'remaining', v_requested;
        end if;
      end loop;
    end if;
  end if;
  v_id := '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 24);
  v_data := (p_data - array['requesterId', 'requesterCode', 'requesterName', 'requesterAvatar',
    'createdById', 'createdByCode', 'createdByName', 'companyId', 'status', 'approvalSteps',
    'currentStepIndex', 'createdAt', 'attendanceSyncStatus', 'attendanceSyncedAt', 'code'])
    || jsonb_build_object(
      'code', (extract(epoch from v_now) * 1000)::bigint::text,
      'companyId', v_company,
      'requesterId', v_me.id,
      'requesterCode', coalesce(v_me.employee_id, v_me.username, ''),
      'requesterName', v_me.name,
      'requesterAvatar', coalesce(v_me.avatar_url, ''),
      'createdById', v_me.id,
      'createdByCode', coalesce(v_me.employee_id, v_me.username, ''),
      'createdByName', v_me.name,
      'status', 'pending', 'currentStepIndex', 0,
      'approvalSteps', jsonb_build_array(jsonb_build_object(
        'approverId', v_leader->>'id', 'approverName', v_leader->>'name',
        'approverAvatar', v_leader->>'avatar', 'decision', null,
        'decidedAt', null, 'comment', '')),
      'createdAt', v_now
    );
  if v_start is not null then v_data := v_data || jsonb_build_object('attendanceSyncStatus', 'pending'); end if;
  insert into public.hr_records (id, collection, data, updated_at)
  values ('approvalRequests::' || v_id, 'approvalRequests', v_data, v_now);
  return v_id;
end;
$$;

create or replace function public.decide_employee_approval(p_id text, p_decision text, p_comment text default '')
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_me public.users%rowtype;
  v_request public.hr_records%rowtype;
  v_steps jsonb;
  v_step jsonb;
  v_index integer;
  v_status text;
  v_date date;
  v_end date;
  v_month text;
  v_day text;
  v_existing text;
  v_workday numeric;
begin
  if p_decision not in ('approved', 'rejected') then raise exception 'Quyết định không hợp lệ.'; end if;
  select * into v_me from public.users where auth_user_id = auth.uid();
  if v_me.id is null then raise exception 'Tài khoản chưa liên kết hồ sơ nhân sự.'; end if;
  select * into v_request from public.hr_records
  where id = 'approvalRequests::' || p_id and collection = 'approvalRequests' for update;
  if v_request.id is null then raise exception 'Không tìm thấy đơn đề xuất.'; end if;
  if coalesce(nullif(v_request.data->>'companyId', ''), 'speego-original')
    <> coalesce(nullif(to_jsonb(v_me)->>'company_id', ''), 'speego-original') then
    raise exception 'Đơn không thuộc công ty của bạn.';
  end if;
  if v_request.data->>'status' <> 'pending' then raise exception 'Đơn đã được xử lý.'; end if;
  v_index := coalesce((v_request.data->>'currentStepIndex')::integer, 0);
  v_steps := v_request.data->'approvalSteps';
  v_step := v_steps->v_index;
  if v_step is null then raise exception 'Đơn chưa có người phê duyệt.'; end if;
  if v_step->>'approverId' <> v_me.id::text and v_me.role not in ('admin', 'hr') then
    raise exception 'Bạn không phải người được chỉ định duyệt đơn này.';
  end if;
  v_step := v_step || jsonb_build_object('decision', p_decision, 'decidedAt', now(),
    'comment', coalesce(p_comment, ''), 'decidedById', v_me.id,
    'decidedByName', v_me.name, 'decidedByAvatar', coalesce(v_me.avatar_url, ''));
  v_steps := jsonb_set(v_steps, array[v_index::text], v_step);
  v_status := case when p_decision = 'rejected' then 'rejected'
    when v_index = jsonb_array_length(v_steps) - 1 then 'approved' else 'pending' end;
  v_request.data := v_request.data || jsonb_build_object(
    'approvalSteps', v_steps, 'status', v_status,
    'currentStepIndex', case when v_status = 'pending' then v_index + 1 else v_index end);
  if v_status = 'approved'
    and (v_request.data->>'templateId' = 'leave' or v_request.data->>'attendanceSync' = 'paid-leave')
    and coalesce(v_request.data->>'leaveType', 'paid') = 'paid'
    and v_request.data->>'attendanceSyncStatus' is distinct from 'synced' then
    v_date := (v_request.data->>'leaveStartDate')::date;
    v_end := (v_request.data->>'leaveEndDate')::date;
    if v_date is null or v_end is null or v_end < v_date then
      raise exception 'Đơn nghỉ phép chưa có khoảng ngày hợp lệ để đồng bộ chấm công.';
    end if;
    v_workday := case when v_request.data->>'leaveDuration' = 'half' then 0.5 else 1 end;
    while v_date <= v_end loop
      v_month := to_char(v_date, 'YYYY-MM');
      v_day := extract(day from v_date)::integer::text;
      select data->>(v_request.data->>'requesterId') into v_existing
      from public.hr_records where id = 'attendanceAdjustments::' || v_month;
      if not (v_day = any(string_to_array(coalesce(v_existing, ''), ','))) then
        v_existing := concat_ws(',', nullif(v_existing, ''), v_day);
      end if;
      insert into public.hr_records (id, collection, data, updated_at)
      values ('attendanceAdjustments::' || v_month, 'attendanceAdjustments',
        jsonb_build_object(v_request.data->>'requesterId', v_existing), now())
      on conflict (id) do update set data = coalesce(public.hr_records.data, '{}'::jsonb) || excluded.data,
        updated_at = now();
      insert into public.hr_records (id, collection, data, updated_at)
      values ('manualWorkdays::' || v_month || '__' || (v_request.data->>'requesterId'),
        'manualWorkdays', jsonb_build_object(v_day, v_workday), now())
      on conflict (id) do update set data = coalesce(public.hr_records.data, '{}'::jsonb) || excluded.data,
        updated_at = now();
      v_date := v_date + 1;
    end loop;
    v_request.data := v_request.data || jsonb_build_object('attendanceSyncStatus', 'synced',
      'attendanceSyncedAt', now(), 'attendanceEmployeeId', v_request.data->>'requesterId');
  end if;
  update public.hr_records set data = v_request.data, updated_at = now() where id = v_request.id;
  return v_request.data;
end;
$$;

revoke all on function public.my_team_leader() from public, anon;
revoke all on function public.approval_leave_used(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.my_approval_leave_balance(integer) from public, anon;
revoke all on function public.submit_employee_approval(jsonb) from public, anon;
revoke all on function public.decide_employee_approval(text, text, text) from public, anon;
grant execute on function public.my_team_leader() to authenticated;
grant execute on function public.my_approval_leave_balance(integer) to authenticated;
grant execute on function public.submit_employee_approval(jsonb) to authenticated;
grant execute on function public.decide_employee_approval(text, text, text) to authenticated;

-- Scope approval records by company, including the two older records without
-- companyId (which belong to the original company).
drop policy if exists "hr_records_select_authenticated" on public.hr_records;
create policy "hr_records_select_authenticated" on public.hr_records for select to authenticated
using (
  (collection <> 'approvalRequests' and public.current_hr_role() in ('admin', 'hr', 'manager'))
  or (collection = 'approvalRequests'
    and coalesce(nullif(data->>'companyId', ''), 'speego-original') = public.current_leave_company_id()
    and (public.current_hr_role() in ('admin', 'hr', 'manager')
      or data->>'requesterId' = public.current_hr_profile_id()::text
      or coalesce(data->'approvalSteps', '[]'::jsonb) @> jsonb_build_array(
        jsonb_build_object('approverId', public.current_hr_profile_id()::text))))
  or (collection = 'attendanceLogs' and data->>'employeeId' = public.current_hr_profile_id()::text)
);
drop policy if exists "hr_records_insert_staff" on public.hr_records;
create policy "hr_records_insert_staff" on public.hr_records for insert to authenticated
with check (public.current_hr_role() in ('admin', 'hr', 'manager')
  and (collection <> 'approvalRequests'
    or coalesce(nullif(data->>'companyId', ''), 'speego-original') = public.current_leave_company_id()));
drop policy if exists "hr_records_update_staff" on public.hr_records;
create policy "hr_records_update_staff" on public.hr_records for update to authenticated
using (public.current_hr_role() in ('admin', 'hr', 'manager')
  and (collection <> 'approvalRequests'
    or coalesce(nullif(data->>'companyId', ''), 'speego-original') = public.current_leave_company_id()))
with check (public.current_hr_role() in ('admin', 'hr', 'manager')
  and (collection <> 'approvalRequests'
    or coalesce(nullif(data->>'companyId', ''), 'speego-original') = public.current_leave_company_id()));
drop policy if exists "hr_records_delete_staff" on public.hr_records;
create policy "hr_records_delete_staff" on public.hr_records for delete to authenticated
using (public.current_hr_role() in ('admin', 'hr', 'manager')
  and (collection <> 'approvalRequests'
    or coalesce(nullif(data->>'companyId', ''), 'speego-original') = public.current_leave_company_id()));
