-- Keep evidence on the request and create a missing day's log only after approval.
create or replace function public.attendance_correction_evidence(p_request jsonb, p_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_request jsonb;
begin
  if p_url is null or p_url = '' then return p_request; end if;
  if length(p_url) > 2048 or p_url !~ '^https://res\.cloudinary\.com/' then
    raise exception 'Ảnh minh chứng không hợp lệ.';
  end if;
  v_request := p_request || jsonb_build_object('evidenceUrl', p_url);
  update public.hr_records set data = v_request, updated_at = clock_timestamp()
  where id = 'attendanceCorrectionRequests::' || (p_request->>'id');
  return v_request;
end;
$$;

create or replace function public.submit_attendance_correction_with_evidence(
  p_date date, p_log_id text, p_check_in text, p_check_out text, p_reason text, p_evidence_url text
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return public.attendance_correction_evidence(
    public.submit_attendance_correction(p_date, p_log_id, p_check_in, p_check_out, p_reason), p_evidence_url);
end;
$$;

create or replace function public.submit_attendance_pair_correction_with_evidence(
  p_date date, p_log_id text, p_pair_index integer, p_check_in text, p_check_out text, p_reason text, p_evidence_url text
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return public.attendance_correction_evidence(
    public.submit_attendance_pair_correction(p_date, p_log_id, p_pair_index, p_check_in, p_check_out, p_reason), p_evidence_url);
end;
$$;

create or replace function public.submit_missing_attendance_correction(
  p_date date, p_check_in text, p_check_out text, p_reason text, p_evidence_url text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.users%rowtype;
  v_id text := gen_random_uuid()::text;
  v_request jsonb;
  v_now timestamptz := clock_timestamp();
begin
  v_profile := public.online_attendance_profile(null);
  if p_date is null or p_date > (v_now at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Ngày yêu cầu không hợp lệ.';
  end if;
  if p_check_in is null or p_check_in !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or p_check_out is null or p_check_out !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Hãy nhập đủ giờ vào và giờ ra theo định dạng HH:MM.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 or length(btrim(p_reason)) > 1000 then
    raise exception 'Vui lòng ghi lý do từ 5 đến 1.000 ký tự.';
  end if;
  if p_evidence_url is not null and p_evidence_url <> ''
    and (length(p_evidence_url) > 2048 or p_evidence_url !~ '^https://res\.cloudinary\.com/') then
    raise exception 'Ảnh minh chứng không hợp lệ.';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_profile.id::text || ':' || p_date::text));
  if exists (select 1 from public.hr_records where collection = 'attendanceLogs'
    and data->>'employeeId' = v_profile.id::text and data->>'date' = p_date::text) then
    raise exception 'Ngày này đã có chấm công. Hãy sửa bản ghi hiện có.';
  end if;
  if exists (select 1 from public.hr_records where collection = 'attendanceCorrectionRequests'
    and data->>'requesterId' = v_profile.id::text and data->>'date' = p_date::text
    and data->>'status' = 'pending') then
    raise exception 'Ngày này đã có yêu cầu đang chờ duyệt.';
  end if;
  v_request := jsonb_build_object(
    'id', v_id, 'companyId', coalesce(nullif(to_jsonb(v_profile)->>'company_id', ''), 'speego-original'),
    'attendanceLogId', 'correction-' || v_id, 'missingDay', true,
    'date', p_date::text, 'requesterId', v_profile.id::text,
    'requesterCode', coalesce(v_profile.employee_id, v_profile.username, ''),
    'requesterName', coalesce(v_profile.name, ''), 'department', coalesce(v_profile.department, ''),
    'originalCheckIn', null, 'originalCheckOut', null,
    'requestedCheckIn', p_check_in, 'requestedCheckOut', p_check_out,
    'reason', btrim(p_reason), 'evidenceUrl', nullif(p_evidence_url, ''),
    'status', 'pending', 'createdAt', v_now);
  insert into public.hr_records (id, collection, data, updated_at)
  values ('attendanceCorrectionRequests::' || v_id, 'attendanceCorrectionRequests', v_request, v_now);
  return v_request;
end;
$$;

create or replace function public.decide_missing_attendance_correction(
  p_id text, p_decision text, p_comment text default ''
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_request jsonb;
  v_reviewer public.users%rowtype;
  v_log_id text;
begin
  v_reviewer := public.online_attendance_profile(null);
  select data into v_request from public.hr_records
  where id = 'attendanceCorrectionRequests::' || p_id and collection = 'attendanceCorrectionRequests' for update;
  if v_request is null or v_request->>'missingDay' <> 'true' or v_request->>'status' <> 'pending' then
    raise exception 'Yêu cầu không tồn tại hoặc đã được xử lý.';
  end if;
  if p_decision = 'approved' then
    perform pg_advisory_xact_lock(hashtext((v_request->>'requesterId') || ':' || (v_request->>'date')));
    if exists (select 1 from public.hr_records where collection = 'attendanceLogs'
      and data->>'employeeId' = v_request->>'requesterId' and data->>'date' = v_request->>'date') then
      raise exception 'Ngày này đã có chấm công; cần xử lý bản ghi hiện có trước.';
    end if;
    v_log_id := 'attendanceLogs::' || (v_request->>'attendanceLogId');
    insert into public.hr_records (id, collection, data, updated_at)
    values (v_log_id, 'attendanceLogs', jsonb_build_object(
      'id', v_request->>'attendanceLogId', 'employeeId', v_request->>'requesterId',
      'date', v_request->>'date', 'companyId', v_request->>'companyId',
      'source', 'approvedCorrection'), clock_timestamp());
  end if;
  return public.decide_attendance_correction(p_id, p_decision, p_comment);
end;
$$;

revoke all on function public.attendance_correction_evidence(jsonb, text) from public;
revoke all on function public.submit_attendance_correction_with_evidence(date, text, text, text, text, text) from public;
revoke all on function public.submit_attendance_pair_correction_with_evidence(date, text, integer, text, text, text, text) from public;
revoke all on function public.submit_missing_attendance_correction(date, text, text, text, text) from public;
revoke all on function public.decide_missing_attendance_correction(text, text, text) from public;
grant execute on function public.submit_attendance_correction_with_evidence(date, text, text, text, text, text) to anon, authenticated;
grant execute on function public.submit_attendance_pair_correction_with_evidence(date, text, integer, text, text, text, text) to anon, authenticated;
grant execute on function public.submit_missing_attendance_correction(date, text, text, text, text) to anon, authenticated;
grant execute on function public.decide_missing_attendance_correction(text, text, text) to anon, authenticated;
