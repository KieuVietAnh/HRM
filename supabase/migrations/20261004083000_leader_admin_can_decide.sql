-- Leader và Admin duyệt được đơn trên mục Gửi đến, kể cả khi đăng nhập bằng tài khoản
-- (không có phiên Supabase Auth). Hàm cũ chỉ tìm hồ sơ qua auth.uid().

create or replace function public.decide_employee_approval(p_id text, p_decision text, p_comment text default '')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me public.users%rowtype;
  v_requester public.users%rowtype;
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
  v_allowed boolean := false;
  v_is_leader boolean := false;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Quyết định không hợp lệ.';
  end if;

  if auth.uid() is not null then
    select * into v_me from public.users where auth_user_id = auth.uid() limit 1;
  end if;
  if v_me.id is null and to_regprocedure('public.current_hr_profile_id()') is not null then
    select * into v_me from public.users where id = public.current_hr_profile_id() limit 1;
  end if;
  if v_me.id is null then
    raise exception 'Tài khoản chưa liên kết hồ sơ nhân sự.';
  end if;

  select * into v_request from public.hr_records
  where id = 'approvalRequests::' || p_id and collection = 'approvalRequests'
  for update;
  if v_request.id is null then
    raise exception 'Không tìm thấy đơn đề xuất.';
  end if;
  if coalesce(nullif(v_request.data->>'companyId', ''), 'speego-original')
    <> coalesce(nullif(to_jsonb(v_me)->>'company_id', ''), 'speego-original') then
    raise exception 'Đơn không thuộc công ty của bạn.';
  end if;
  if v_request.data->>'status' <> 'pending' then
    raise exception 'Đơn đã được xử lý.';
  end if;

  v_index := coalesce((v_request.data->>'currentStepIndex')::integer, 0);
  v_steps := v_request.data->'approvalSteps';
  v_step := v_steps->v_index;
  if v_step is null then
    raise exception 'Đơn chưa có người phê duyệt.';
  end if;

  v_allowed := v_step->>'approverId' = v_me.id::text
    or lower(coalesce(v_me.role, '')) in ('admin', 'hr');

  if not v_allowed then
    v_is_leader := lower(coalesce(to_jsonb(v_me)->>'is_team_leader', '')) in ('true', 't', 'yes', '1')
      or coalesce(v_me.position, '') ~* '(^|[^[:alpha:]])leader([^[:alpha:]]|$)'
      or coalesce(v_me.position, '') ~* 'trưởng';
    if v_is_leader and nullif(btrim(v_me.department), '') is not null then
      select * into v_requester from public.users
      where id::text = v_request.data->>'requesterId'
      limit 1;
      if v_requester.id is not null
        and lower(btrim(coalesce(v_requester.department, ''))) = lower(btrim(v_me.department))
        and (
          nullif(btrim(v_me.branch), '') is null
          or nullif(btrim(v_requester.branch), '') is null
          or lower(btrim(v_requester.branch)) = lower(btrim(v_me.branch))
        ) then
        v_allowed := true;
      end if;
    end if;
  end if;

  if not v_allowed then
    raise exception 'Bạn không phải người được chỉ định duyệt đơn này.';
  end if;

  v_step := v_step || jsonb_build_object(
    'decision', p_decision,
    'decidedAt', now(),
    'comment', coalesce(p_comment, ''),
    'decidedById', v_me.id,
    'decidedByName', v_me.name,
    'decidedByAvatar', coalesce(v_me.avatar_url, '')
  );
  v_steps := jsonb_set(v_steps, array[v_index::text], v_step);
  v_status := case
    when p_decision = 'rejected' then 'rejected'
    when v_index = jsonb_array_length(v_steps) - 1 then 'approved'
    else 'pending'
  end;
  v_request.data := v_request.data || jsonb_build_object(
    'approvalSteps', v_steps,
    'status', v_status,
    'currentStepIndex', case when v_status = 'pending' then v_index + 1 else v_index end
  );

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
      values (
        'attendanceAdjustments::' || v_month,
        'attendanceAdjustments',
        jsonb_build_object(v_request.data->>'requesterId', v_existing),
        now()
      )
      on conflict (id) do update
        set data = coalesce(public.hr_records.data, '{}'::jsonb) || excluded.data,
            updated_at = now();
      insert into public.hr_records (id, collection, data, updated_at)
      values (
        'manualWorkdays::' || v_month || '__' || (v_request.data->>'requesterId'),
        'manualWorkdays',
        jsonb_build_object(v_day, v_workday),
        now()
      )
      on conflict (id) do update
        set data = coalesce(public.hr_records.data, '{}'::jsonb) || excluded.data,
            updated_at = now();
      v_date := v_date + 1;
    end loop;
    v_request.data := v_request.data || jsonb_build_object(
      'attendanceSyncStatus', 'synced',
      'attendanceSyncedAt', now(),
      'attendanceEmployeeId', v_request.data->>'requesterId'
    );
  end if;

  update public.hr_records
  set data = v_request.data, updated_at = now()
  where id = v_request.id;
  return v_request.data;
end;
$$;

revoke all on function public.decide_employee_approval(text, text, text) from public;
grant execute on function public.decide_employee_approval(text, text, text) to anon, authenticated;
