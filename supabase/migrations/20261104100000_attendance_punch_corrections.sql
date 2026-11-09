-- Employees can request a correction to an existing online attendance record.
-- HR, managers, and admins review the request before attendance data changes.

create index if not exists hr_records_attendance_correction_requests_idx
  on public.hr_records ((data->>'companyId'), (data->>'status'), updated_at desc)
  where collection = 'attendanceCorrectionRequests';

create or replace function public.list_attendance_correction_requests()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.users%rowtype;
  v_company text;
  v_requests jsonb;
begin
  v_profile := public.online_attendance_profile(null);
  v_company := coalesce(nullif(to_jsonb(v_profile)->>'company_id', ''), 'speego-original');

  if coalesce(v_profile.role, 'user') in ('admin', 'hr', 'manager') then
    select coalesce(jsonb_agg(data order by data->>'createdAt' desc), '[]'::jsonb)
    into v_requests
    from (
      select data
      from public.hr_records
      where collection = 'attendanceCorrectionRequests'
        and coalesce(nullif(data->>'companyId', ''), 'speego-original') = v_company
      order by data->>'createdAt' desc
      limit 500
    ) requests;
  else
    select coalesce(jsonb_agg(data order by data->>'createdAt' desc), '[]'::jsonb)
    into v_requests
    from (
      select data
      from public.hr_records
      where collection = 'attendanceCorrectionRequests'
        and data->>'requesterId' = v_profile.id::text
      order by data->>'createdAt' desc
      limit 200
    ) requests;
  end if;

  return v_requests;
end;
$$;

create or replace function public.submit_attendance_correction(
  p_date date,
  p_log_id text,
  p_check_in text,
  p_check_out text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.users%rowtype;
  v_company text;
  v_timezone text := 'Asia/Ho_Chi_Minh';
  v_today date;
  v_log_id text;
  v_log_data jsonb;
  v_original_in text;
  v_original_out text;
  v_target_in text;
  v_target_out text;
  v_id text := gen_random_uuid()::text;
  v_now timestamptz := clock_timestamp();
  v_request jsonb;
begin
  v_profile := public.online_attendance_profile(null);
  v_company := coalesce(nullif(to_jsonb(v_profile)->>'company_id', ''), 'speego-original');

  if p_date is null then raise exception 'Ngày chấm công không hợp lệ.'; end if;
  if nullif(trim(coalesce(p_log_id, '')), '') is null then raise exception 'Không tìm thấy bản ghi chấm công.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Vui lòng ghi rõ lý do (ít nhất 5 ký tự).'; end if;
  if length(trim(p_reason)) > 1000 then raise exception 'Lý do không được vượt quá 1.000 ký tự.'; end if;
  if p_check_in is null and p_check_out is null then raise exception 'Hãy thay đổi ít nhất một mốc giờ chấm công.'; end if;
  if p_check_in is not null and p_check_in <> '' and p_check_in !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Giờ vào phải theo định dạng HH:MM.';
  end if;
  if p_check_out is not null and p_check_out <> '' and p_check_out !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Giờ ra phải theo định dạng HH:MM.';
  end if;

  select data into v_log_data
  from public.hr_records
  where id = case when p_log_id like 'attendanceLogs::%' then p_log_id else 'attendanceLogs::' || p_log_id end
    and collection = 'attendanceLogs'
    and data->>'employeeId' = v_profile.id::text
    and data->>'date' = to_char(p_date, 'YYYY-MM-DD');
  if v_log_data is null then raise exception 'Không tìm thấy bản ghi chấm công của bạn trong ngày này.'; end if;

  select data->>'timezone' into v_timezone
  from public.hr_records where id = 'attendanceSettings::default';
  v_timezone := coalesce(nullif(v_timezone, ''), 'Asia/Ho_Chi_Minh');
  v_today := (v_now at time zone v_timezone)::date;
  if p_date > v_today then raise exception 'Không thể yêu cầu điều chỉnh ngày chấm công trong tương lai.'; end if;

  v_original_in := nullif(v_log_data->>'vao', '');
  v_original_out := nullif(v_log_data->>'ra', '');
  if v_original_in is null and nullif(v_log_data->>'checkIn', '') is not null then
    begin
      v_original_in := to_char((v_log_data->>'checkIn')::timestamptz at time zone v_timezone, 'HH24:MI');
    exception when others then
      v_original_in := null;
    end;
  end if;
  if v_original_out is null and nullif(v_log_data->>'checkOut', '') is not null then
    begin
      v_original_out := to_char((v_log_data->>'checkOut')::timestamptz at time zone v_timezone, 'HH24:MI');
    exception when others then
      v_original_out := null;
    end;
  end if;
  if v_original_in is null and v_original_out is null then
    raise exception 'Bản ghi này chưa có mốc chấm công để điều chỉnh.';
  end if;
  if (p_check_in is null or p_check_in = coalesce(v_original_in, ''))
    and (p_check_out is null or p_check_out = coalesce(v_original_out, '')) then
    raise exception 'Giờ mới phải khác giờ chấm công hiện tại.';
  end if;
  v_target_in := case when p_check_in is null then v_original_in else nullif(p_check_in, '') end;
  v_target_out := case when p_check_out is null then v_original_out else nullif(p_check_out, '') end;
  if v_target_in is null and v_target_out is null then
    raise exception 'Yêu cầu phải giữ lại ít nhất một mốc chấm công trong ngày.';
  end if;

  v_log_id := case when p_log_id like 'attendanceLogs::%' then substring(p_log_id from 17) else p_log_id end;
  perform pg_advisory_xact_lock(hashtext(v_profile.id::text || ':' || v_log_id));
  if exists (
    select 1 from public.hr_records
    where collection = 'attendanceCorrectionRequests'
      and data->>'requesterId' = v_profile.id::text
      and data->>'attendanceLogId' = v_log_id
      and data->>'status' = 'pending'
  ) then
    raise exception 'Bạn đã có yêu cầu đang chờ duyệt cho ngày chấm công này.';
  end if;

  v_request := jsonb_build_object(
    'id', v_id,
    'companyId', v_company,
    'attendanceLogId', v_log_id,
    'date', to_char(p_date, 'YYYY-MM-DD'),
    'requesterId', v_profile.id::text,
    'requesterCode', coalesce(v_profile.employee_id, v_profile.username, ''),
    'requesterName', coalesce(v_profile.name, ''),
    'department', coalesce(v_profile.department, ''),
    'originalCheckIn', v_original_in,
    'originalCheckOut', v_original_out,
    'requestedCheckIn', p_check_in,
    'requestedCheckOut', p_check_out,
    'reason', trim(p_reason),
    'status', 'pending',
    'createdAt', v_now
  );

  insert into public.hr_records (id, collection, data, updated_at)
  values ('attendanceCorrectionRequests::' || v_id, 'attendanceCorrectionRequests', v_request, v_now);
  return v_request;
end;
$$;

create or replace function public.decide_attendance_correction(
  p_id text,
  p_decision text,
  p_comment text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.users%rowtype;
  v_employee public.users%rowtype;
  v_company text;
  v_request public.hr_records%rowtype;
  v_request_data jsonb;
  v_log_id text;
  v_log_data jsonb;
  v_settings jsonb;
  v_shift jsonb;
  v_timezone text := 'Asia/Ho_Chi_Minh';
  v_date date;
  v_in_text text;
  v_out_text text;
  v_in_time time;
  v_out_time time;
  v_standard_in time;
  v_standard_out time;
  v_check_in timestamptz;
  v_check_out timestamptz;
  v_elapsed_minutes numeric;
  v_hours numeric;
  v_break_minutes numeric;
  v_standard_minutes numeric := 480;
  v_late integer := 0;
  v_early integer := 0;
  v_now timestamptz := clock_timestamp();
begin
  if p_decision not in ('approved', 'rejected') then raise exception 'Quyết định không hợp lệ.'; end if;
  if p_decision = 'rejected' and length(trim(coalesce(p_comment, ''))) < 3 then
    raise exception 'Vui lòng ghi lý do từ chối (ít nhất 3 ký tự).';
  end if;

  v_profile := public.online_attendance_profile(null);
  if coalesce(v_profile.role, 'user') not in ('admin', 'hr', 'manager') then
    raise exception 'Bạn không có quyền duyệt yêu cầu điều chỉnh công.';
  end if;
  v_company := coalesce(nullif(to_jsonb(v_profile)->>'company_id', ''), 'speego-original');

  select * into v_request
  from public.hr_records
  where id = 'attendanceCorrectionRequests::' || p_id
    and collection = 'attendanceCorrectionRequests'
  for update;
  if v_request.id is null then raise exception 'Không tìm thấy yêu cầu điều chỉnh công.'; end if;

  v_request_data := v_request.data;
  if coalesce(nullif(v_request_data->>'companyId', ''), 'speego-original') <> v_company then
    raise exception 'Yêu cầu không thuộc công ty của bạn.';
  end if;
  if v_request_data->>'status' <> 'pending' then raise exception 'Yêu cầu đã được xử lý.'; end if;
  if v_request_data->>'requesterId' = v_profile.id::text then
    raise exception 'Bạn không thể tự duyệt yêu cầu của mình.';
  end if;

  if p_decision = 'approved' then
    v_date := (v_request_data->>'date')::date;
    v_log_id := 'attendanceLogs::' || (v_request_data->>'attendanceLogId');
    select data into v_log_data
    from public.hr_records
    where id = v_log_id
      and collection = 'attendanceLogs'
      and data->>'employeeId' = v_request_data->>'requesterId'
      and data->>'date' = to_char(v_date, 'YYYY-MM-DD')
    for update;
    if v_log_data is null then raise exception 'Bản ghi chấm công gốc không còn tồn tại.'; end if;

    select data into v_settings from public.hr_records where id = 'attendanceSettings::default';
    v_timezone := coalesce(nullif(v_settings->>'timezone', ''), 'Asia/Ho_Chi_Minh');
    select * into v_employee from public.users where id::text = v_request_data->>'requesterId';
    if v_employee.id is null then raise exception 'Không tìm thấy hồ sơ nhân viên của yêu cầu.'; end if;
    v_shift := public.attendance_shift_for_profile(v_employee, coalesce(v_settings, '{}'::jsonb));
    v_standard_in := coalesce(nullif(v_shift->>'standardCheckIn', ''), '08:30')::time;
    v_standard_out := coalesce(nullif(v_shift->>'standardCheckOut', ''), '17:30')::time;
    v_standard_minutes := coalesce(
      nullif(v_settings->>'standardWorkMinutes', '')::numeric,
      nullif(v_settings->>'standardMinutes', '')::numeric,
      480
    );

    v_in_text := v_request_data->>'requestedCheckIn';
    if v_in_text is null then v_in_text := nullif(v_log_data->>'vao', ''); end if;
    if v_in_text is null and nullif(v_log_data->>'checkIn', '') is not null then
      begin
        v_in_text := to_char((v_log_data->>'checkIn')::timestamptz at time zone v_timezone, 'HH24:MI');
      exception when others then v_in_text := null;
      end;
    end if;

    v_out_text := v_request_data->>'requestedCheckOut';
    if v_out_text is null then v_out_text := nullif(v_log_data->>'ra', ''); end if;
    if v_out_text is null and nullif(v_log_data->>'checkOut', '') is not null then
      begin
        v_out_text := to_char((v_log_data->>'checkOut')::timestamptz at time zone v_timezone, 'HH24:MI');
      exception when others then v_out_text := null;
      end;
    end if;

    if v_in_text is not null and v_in_text <> '' then v_in_time := v_in_text::time; end if;
    if v_out_text is not null and v_out_text <> '' then v_out_time := v_out_text::time; end if;
    if v_in_time is null and v_out_time is null then
      raise exception 'Yêu cầu không thể xóa toàn bộ mốc chấm công trong ngày.';
    end if;
    if v_in_time is not null and v_out_time is not null
      and v_out_time <= v_in_time and v_standard_out > v_standard_in then
      raise exception 'Giờ ra phải sau giờ vào với ca làm việc này.';
    end if;

    if v_in_time is not null then
      v_check_in := ((v_date + v_in_time) at time zone v_timezone);
      v_late := greatest(0, floor(extract(epoch from (v_in_time - v_standard_in)) / 60)::integer);
    end if;
    if v_out_time is not null then
      v_check_out := (((v_date + v_out_time + case when v_in_time is not null and v_out_time <= v_in_time and v_standard_out <= v_standard_in then interval '1 day' else interval '0' end)) at time zone v_timezone);
      v_early := greatest(0, floor(extract(epoch from (v_standard_out - v_out_time)) / 60)::integer);
    end if;

    if v_in_time is not null and v_out_time is not null then
      v_elapsed_minutes := extract(epoch from (v_check_out - v_check_in)) / 60;
      v_break_minutes := coalesce(nullif(v_settings->>'unpaidBreakMinutes', '')::numeric, 90);
      if v_in_time <= time '12:00' and v_out_time >= time '13:30' then
        v_elapsed_minutes := greatest(0, v_elapsed_minutes - v_break_minutes);
      end if;
      v_hours := round(v_elapsed_minutes / 60, 1);
    else
      v_hours := 0;
    end if;

    v_log_data := v_log_data || jsonb_build_object(
      'checkIn', v_check_in,
      'vao', coalesce(to_char(v_in_time, 'HH24:MI'), ''),
      'checkOut', v_check_out,
      'ra', coalesce(to_char(v_out_time, 'HH24:MI'), ''),
      'lateMinutes', v_late,
      'vaoTre', v_late,
      'earlyMinutes', v_early,
      'raSom', v_early,
      'hours', v_hours,
      'gio', v_hours,
      'tongGio', v_hours,
      'cong', case when v_hours >= v_standard_minutes / 60 then 1 when v_hours >= v_standard_minutes / 120 then 0.5 else 0 end,
      'status', case when v_hours >= v_standard_minutes / 60 then 'Đủ' else 'Thiếu' end,
      'correctionHistory', coalesce(v_log_data->'correctionHistory', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'requestId', p_id,
        'decidedById', v_profile.id::text,
        'decidedByName', coalesce(v_profile.name, ''),
        'decidedAt', v_now,
        'reason', v_request_data->>'reason',
        'comment', coalesce(p_comment, ''),
        'checkIn', v_in_time,
        'checkOut', v_out_time
      ))
    );
    update public.hr_records set data = v_log_data, updated_at = v_now where id = v_log_id;
  end if;

  v_request_data := v_request_data || jsonb_build_object(
    'status', p_decision,
    'decidedAt', v_now,
    'decidedById', v_profile.id::text,
    'decidedByName', coalesce(v_profile.name, ''),
    'comment', trim(coalesce(p_comment, ''))
  );
  update public.hr_records set data = v_request_data, updated_at = v_now where id = v_request.id;
  return v_request_data;
end;
$$;

revoke all on function public.list_attendance_correction_requests() from public;
revoke all on function public.submit_attendance_correction(date, text, text, text, text) from public;
revoke all on function public.decide_attendance_correction(text, text, text) from public;
grant execute on function public.list_attendance_correction_requests() to anon, authenticated;
grant execute on function public.submit_attendance_correction(date, text, text, text, text) to anon, authenticated;
grant execute on function public.decide_attendance_correction(text, text, text) to anon, authenticated;
