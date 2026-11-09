-- Correct one punch pair without changing other punches in the same shift.
create or replace function public.submit_attendance_pair_correction(
  p_date date, p_log_id text, p_pair_index integer,
  p_check_in text, p_check_out text, p_reason text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.users%rowtype;
  v_log_id text;
  v_log jsonb;
  v_pairs jsonb;
  v_pair jsonb;
  v_original_in text;
  v_original_out text;
  v_id text := gen_random_uuid()::text;
  v_now timestamptz := clock_timestamp();
  v_request jsonb;
begin
  v_profile := public.online_attendance_profile(null);
  if p_date is null or p_pair_index is null or p_pair_index < 0 then
    raise exception 'Ngày hoặc lượt chấm công không hợp lệ.';
  end if;
  if p_date > (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Không thể điều chỉnh ngày chấm công trong tương lai.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 or length(btrim(p_reason)) > 1000 then
    raise exception 'Vui lòng ghi lý do từ 5 đến 1.000 ký tự.';
  end if;
  if p_check_in is null and p_check_out is null then
    raise exception 'Hãy thay đổi ít nhất một mốc chấm công.';
  end if;
  if p_check_in is not null and p_check_in <> '' and p_check_in !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Giờ vào phải theo định dạng HH:MM.';
  end if;
  if p_check_out is not null and p_check_out <> '' and p_check_out !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Giờ ra phải theo định dạng HH:MM.';
  end if;

  v_log_id := case when p_log_id like 'attendanceLogs::%' then p_log_id else 'attendanceLogs::' || p_log_id end;
  perform pg_advisory_xact_lock(hashtext(v_profile.id::text || ':' || v_log_id));
  select data into v_log from public.hr_records
  where id = v_log_id and collection = 'attendanceLogs'
    and data->>'employeeId' = v_profile.id::text
    and data->>'date' = to_char(p_date, 'YYYY-MM-DD');
  if v_log is null then raise exception 'Không tìm thấy bản ghi chấm công của bạn.'; end if;
  v_pairs := v_log->'punchPairs';
  if jsonb_typeof(v_pairs) <> 'array' or p_pair_index >= jsonb_array_length(v_pairs) then
    raise exception 'Không tìm thấy lượt chấm công cần sửa.';
  end if;
  v_pair := v_pairs->p_pair_index;
  v_original_in := coalesce(v_pair->>'checkIn', '');
  v_original_out := coalesce(v_pair->>'checkOut', '');
  if (p_check_in is null or p_check_in = v_original_in)
    and (p_check_out is null or p_check_out = v_original_out) then
    raise exception 'Giờ mới phải khác giờ chấm công hiện tại.';
  end if;
  if coalesce(p_check_in, v_original_in) = '' and coalesce(p_check_out, v_original_out) = '' then
    raise exception 'Lượt chấm công cần giữ ít nhất một mốc giờ.';
  end if;
  if exists (
    select 1 from public.hr_records
    where collection = 'attendanceCorrectionRequests'
      and data->>'requesterId' = v_profile.id::text
      and data->>'attendanceLogId' = substring(v_log_id from 17)
      and data->>'status' = 'pending'
  ) then raise exception 'Bản ghi này đã có yêu cầu đang chờ duyệt.'; end if;

  v_request := jsonb_build_object(
    'id', v_id,
    'companyId', coalesce(nullif(to_jsonb(v_profile)->>'company_id', ''), 'speego-original'),
    'attendanceLogId', substring(v_log_id from 17),
    'pairIndex', p_pair_index,
    'date', to_char(p_date, 'YYYY-MM-DD'),
    'requesterId', v_profile.id::text,
    'requesterCode', coalesce(v_profile.employee_id, v_profile.username, ''),
    'requesterName', coalesce(v_profile.name, ''),
    'department', coalesce(v_profile.department, ''),
    'originalCheckIn', v_original_in,
    'originalCheckOut', v_original_out,
    'requestedCheckIn', p_check_in,
    'requestedCheckOut', p_check_out,
    'reason', btrim(p_reason),
    'status', 'pending',
    'createdAt', v_now
  );
  insert into public.hr_records (id, collection, data, updated_at)
  values ('attendanceCorrectionRequests::' || v_id, 'attendanceCorrectionRequests', v_request, v_now);
  return v_request;
end;
$$;

create or replace function public.decide_attendance_pair_correction(
  p_id text, p_decision text, p_comment text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_reviewer public.users%rowtype;
  v_request jsonb;
  v_log_id text;
  v_log jsonb;
  v_pairs jsonb;
  v_pair jsonb;
  v_last_pair jsonb;
  v_index integer;
  v_date date;
  v_in text;
  v_out text;
  v_timezone text := 'Asia/Ho_Chi_Minh';
  v_in_date date;
  v_out_date date;
  v_in_at timestamptz;
  v_out_at timestamptz;
  v_start time;
  v_end time;
  v_late integer := 0;
  v_early integer := 0;
  v_hours numeric := 0;
  v_standard numeric := 480;
  v_now timestamptz := clock_timestamp();
begin
  v_reviewer := public.online_attendance_profile(null);
  if coalesce(v_reviewer.role, 'user') not in ('admin', 'hr', 'manager') then
    raise exception 'Bạn không có quyền duyệt điều chỉnh công.';
  end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Quyết định không hợp lệ.'; end if;
  if p_decision = 'rejected' and length(btrim(coalesce(p_comment, ''))) < 3 then
    raise exception 'Vui lòng ghi lý do từ chối.';
  end if;
  select data into v_request from public.hr_records
  where id = 'attendanceCorrectionRequests::' || p_id
    and collection = 'attendanceCorrectionRequests' for update;
  if v_request is null or v_request->>'status' <> 'pending' then
    raise exception 'Yêu cầu không tồn tại hoặc đã được xử lý.';
  end if;
  if coalesce(nullif(v_request->>'companyId', ''), 'speego-original') <>
    coalesce(nullif(to_jsonb(v_reviewer)->>'company_id', ''), 'speego-original') then
    raise exception 'Yêu cầu không thuộc công ty của bạn.';
  end if;
  if v_request->>'requesterId' = v_reviewer.id::text then
    raise exception 'Bạn không thể tự duyệt yêu cầu của mình.';
  end if;

  if p_decision = 'approved' then
    v_log_id := 'attendanceLogs::' || (v_request->>'attendanceLogId');
    v_date := (v_request->>'date')::date;
    v_index := (v_request->>'pairIndex')::integer;
    select data into v_log from public.hr_records
    where id = v_log_id and collection = 'attendanceLogs'
      and data->>'employeeId' = v_request->>'requesterId'
      and data->>'date' = to_char(v_date, 'YYYY-MM-DD') for update;
    if v_log is null then raise exception 'Bản ghi chấm công gốc không còn tồn tại.'; end if;
    v_pairs := v_log->'punchPairs';
    if jsonb_typeof(v_pairs) <> 'array' or v_index < 0 or v_index >= jsonb_array_length(v_pairs) then
      raise exception 'Lượt chấm công gốc không còn tồn tại.';
    end if;
    v_pair := v_pairs->v_index;
    if coalesce(v_pair->>'checkIn', '') <> coalesce(v_request->>'originalCheckIn', '')
      or coalesce(v_pair->>'checkOut', '') <> coalesce(v_request->>'originalCheckOut', '') then
      raise exception 'Lượt chấm công đã thay đổi; cần gửi lại yêu cầu mới.';
    end if;
    v_in := coalesce(v_request->>'requestedCheckIn', v_pair->>'checkIn', '');
    v_out := coalesce(v_request->>'requestedCheckOut', v_pair->>'checkOut', '');
    if v_in = '' and v_out = '' then raise exception 'Không thể xóa cả hai mốc chấm công.'; end if;
    select coalesce(nullif(data->>'timezone', ''), 'Asia/Ho_Chi_Minh'),
      coalesce(nullif(data->>'standardWorkMinutes', '')::numeric, 480)
      into v_timezone, v_standard
    from public.hr_records where id = 'attendanceSettings::default';
    v_timezone := coalesce(v_timezone, 'Asia/Ho_Chi_Minh');
    v_standard := coalesce(v_standard, 480);
    v_start := coalesce(nullif(v_log->>'standardCheckIn', '')::time, time '08:30');
    v_end := coalesce(nullif(v_log->>'standardCheckOut', '')::time, time '17:30');

    v_in_date := coalesce(((nullif(v_pair->>'checkInTimestamp', '')::timestamptz at time zone v_timezone)::date), v_date);
    if v_index = 0 and v_request->>'requestedCheckIn' is not null
      and v_end <= v_start and v_in <> '' then
      v_in_date := v_date + case when v_in::time < v_end then 1 else 0 end;
    end if;
    if nullif(v_pair->>'checkInTimestamp', '') is null
      and v_end <= v_start and v_in <> '' and v_in::time < v_end then
      v_in_date := v_date + 1;
    end if;
    if v_index > 0 and nullif(v_pair->>'checkInTimestamp', '') is null then
      v_in_date := coalesce(((nullif((v_pairs->(v_index - 1))->>'checkOutTimestamp', '')::timestamptz at time zone v_timezone)::date), v_in_date);
    end if;
    if v_in <> '' then v_in_at := (v_in_date + v_in::time) at time zone v_timezone; end if;
    v_out_date := coalesce(((nullif(v_pair->>'checkOutTimestamp', '')::timestamptz at time zone v_timezone)::date), v_in_date);
    if v_request->>'requestedCheckOut' is not null then v_out_date := v_in_date; end if;
    if v_out <> '' then
      if v_out_date = v_in_date and v_in <> '' and v_out::time <= v_in::time then
        if v_in_date > v_date then
          raise exception 'Giờ ra phải sau giờ vào của lượt chấm công.';
        end if;
        v_out_date := v_out_date + 1;
      end if;
      v_out_at := (v_out_date + v_out::time) at time zone v_timezone;
    end if;
    if v_in_at is not null and v_out_at is not null and v_out_at <= v_in_at then
      raise exception 'Giờ ra phải sau giờ vào của lượt chấm công.';
    end if;
    if v_index > 0 and v_in_at is not null
      and nullif((v_pairs->(v_index - 1))->>'checkOutTimestamp', '') is not null
      and v_in_at < ((v_pairs->(v_index - 1))->>'checkOutTimestamp')::timestamptz then
      raise exception 'Giờ vào trùng với lượt chấm công trước.';
    end if;
    if v_index < jsonb_array_length(v_pairs) - 1 and v_out_at is not null
      and nullif((v_pairs->(v_index + 1))->>'checkInTimestamp', '') is not null
      and v_out_at > ((v_pairs->(v_index + 1))->>'checkInTimestamp')::timestamptz then
      raise exception 'Giờ ra trùng với lượt chấm công sau.';
    end if;
    if v_index = 0 and v_in_at is not null then
      v_late := greatest(0, floor(extract(epoch from (v_in_at - ((v_date + v_start) at time zone v_timezone))) / 60)::integer);
    end if;
    if v_index = jsonb_array_length(v_pairs) - 1 and v_out_at is not null then
      v_early := greatest(0, floor(extract(epoch from ((((v_date + case when v_end <= v_start then 1 else 0 end) + v_end) at time zone v_timezone) - v_out_at)) / 60)::integer);
    end if;
    v_pair := v_pair || jsonb_build_object(
      'checkIn', v_in, 'checkOut', v_out,
      'checkInTimestamp', v_in_at, 'checkOutTimestamp', v_out_at,
      'lateMinutes', v_late, 'earlyMinutes', v_early
    );
    v_pairs := jsonb_set(v_pairs, array[v_index::text], v_pair, false);
    select coalesce(sum(case
      when nullif(pair->>'checkInTimestamp', '') is not null
        and nullif(pair->>'checkOutTimestamp', '') is not null then
        greatest(0, extract(epoch from
          ((pair->>'checkOutTimestamp')::timestamptz - (pair->>'checkInTimestamp')::timestamptz)) / 3600)
      when nullif(pair->>'checkIn', '') is not null
        and nullif(pair->>'checkOut', '') is not null then
        mod(extract(epoch from ((pair->>'checkOut')::time - (pair->>'checkIn')::time)) / 3600 + 24, 24)
      else 0 end), 0)
      into v_hours from jsonb_array_elements(v_pairs) as items(pair);
    v_last_pair := v_pairs->(jsonb_array_length(v_pairs) - 1);
    v_log := v_log || jsonb_build_object(
      'punchPairs', v_pairs,
      'checkIn', v_last_pair->'checkInTimestamp',
      'checkOut', v_last_pair->'checkOutTimestamp',
      'vao', coalesce(v_last_pair->>'checkIn', ''),
      'ra', coalesce(v_last_pair->>'checkOut', ''),
      'lateMinutes', coalesce((v_pairs->0->>'lateMinutes')::integer, (v_log->>'lateMinutes')::integer, 0),
      'vaoTre', coalesce((v_pairs->0->>'lateMinutes')::integer, (v_log->>'lateMinutes')::integer, 0),
      'earlyMinutes', coalesce((v_last_pair->>'earlyMinutes')::integer, (v_log->>'earlyMinutes')::integer, 0),
      'raSom', coalesce((v_last_pair->>'earlyMinutes')::integer, (v_log->>'earlyMinutes')::integer, 0),
      'hours', round(v_hours, 2), 'gio', round(v_hours, 2), 'tongGio', round(v_hours, 2),
      'cong', case when v_hours >= v_standard / 60 then 1 when v_hours >= v_standard / 120 then 0.5 else 0 end,
      'status', case when coalesce(v_last_pair->>'checkOut', '') = '' then 'Đang làm'
        when v_hours >= v_standard / 60 then 'Đủ' else 'Thiếu' end,
      'correctionHistory', coalesce(v_log->'correctionHistory', '[]'::jsonb) ||
        jsonb_build_array(jsonb_build_object('requestId', p_id, 'pairIndex', v_index,
          'decidedById', v_reviewer.id::text, 'decidedAt', v_now,
          'checkIn', v_in, 'checkOut', v_out))
    );
    update public.hr_records set data = v_log, updated_at = v_now where id = v_log_id;
  end if;

  v_request := v_request || jsonb_build_object(
    'status', p_decision, 'decidedAt', v_now,
    'decidedById', v_reviewer.id::text,
    'decidedByName', coalesce(v_reviewer.name, ''),
    'comment', btrim(coalesce(p_comment, ''))
  );
  update public.hr_records set data = v_request, updated_at = v_now
  where id = 'attendanceCorrectionRequests::' || p_id;
  return v_request;
end;
$$;

revoke all on function public.submit_attendance_pair_correction(date, text, integer, text, text, text) from public;
revoke all on function public.decide_attendance_pair_correction(text, text, text) from public;
grant execute on function public.submit_attendance_pair_correction(date, text, integer, text, text, text) to anon, authenticated;
grant execute on function public.decide_attendance_pair_correction(text, text, text) to anon, authenticated;
