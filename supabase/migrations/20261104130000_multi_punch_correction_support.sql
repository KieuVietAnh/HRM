-- Keep the existing correction workflow, then synchronize its approved values
-- into the latest punch pair so summaries continue to use the corrected times.
alter function public.decide_attendance_correction(text, text, text)
  rename to decide_attendance_correction_single_punch;

revoke all on function public.decide_attendance_correction_single_punch(text, text, text)
  from public, anon, authenticated;

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
  v_request jsonb;
  v_log_id text;
  v_log_data jsonb;
  v_pairs jsonb;
  v_pair jsonb;
  v_pair_index integer;
  v_settings jsonb;
  v_employee public.users%rowtype;
  v_shift jsonb;
  v_date date;
  v_timezone text := 'Asia/Ho_Chi_Minh';
  v_start time;
  v_end time;
  v_in_time time;
  v_out_time time;
  v_is_overnight boolean;
  v_in_day_offset integer := 0;
  v_out_day_offset integer := 0;
  v_check_in timestamptz;
  v_check_out timestamptz;
  v_late integer := 0;
  v_early integer := 0;
  v_hours numeric := 0;
  v_worked_minutes numeric := 0;
  v_break_minutes numeric := 0;
  v_standard_minutes numeric := 480;
  v_complete_pair_count integer := 0;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
begin
  v_result := public.decide_attendance_correction_single_punch(p_id, p_decision, p_comment);
  if p_decision <> 'approved' then
    return v_result;
  end if;

  v_log_id := 'attendanceLogs::' || (v_result ->> 'attendanceLogId');
  v_date := (v_result ->> 'date')::date;
  select data into v_log_data
  from public.hr_records
  where id = v_log_id and collection = 'attendanceLogs'
  for update;
  if v_log_data is null then
    return v_result;
  end if;

  v_pairs := v_log_data -> 'punchPairs';
  if jsonb_typeof(v_pairs) <> 'array' or jsonb_array_length(v_pairs) = 0 then
    return v_result;
  end if;

  select data into v_settings from public.hr_records where id = 'attendanceSettings::default';
  v_timezone := coalesce(nullif(v_settings ->> 'timezone', ''), v_timezone);
  v_standard_minutes := coalesce(
    nullif(v_settings ->> 'standardWorkMinutes', '')::numeric,
    nullif(v_settings ->> 'standardMinutes', '')::numeric,
    480
  );
  v_break_minutes := coalesce(nullif(v_settings ->> 'unpaidBreakMinutes', '')::numeric, 0);

  select * into v_employee
  from public.users
  where id::text = v_log_data ->> 'employeeId';
  v_shift := public.attendance_shift_for_profile(v_employee, coalesce(v_settings, '{}'::jsonb));
  v_start := coalesce(
    nullif(v_log_data ->> 'standardCheckIn', '')::time,
    nullif(v_shift ->> 'standardCheckIn', '')::time,
    time '08:30'
  );
  v_end := coalesce(
    nullif(v_log_data ->> 'standardCheckOut', '')::time,
    nullif(v_shift ->> 'standardCheckOut', '')::time,
    time '17:30'
  );
  v_is_overnight := v_end <= v_start;

  v_pair_index := jsonb_array_length(v_pairs) - 1;
  v_pair := v_pairs -> v_pair_index;
  v_in_time := nullif(v_log_data ->> 'vao', '')::time;
  v_out_time := nullif(v_log_data ->> 'ra', '')::time;

  if v_is_overnight and v_in_time is not null and v_in_time < v_end then
    v_in_day_offset := 1;
  end if;
  if v_is_overnight and v_out_time is not null and (
    v_in_day_offset = 1 or (v_in_time is not null and v_out_time <= v_in_time)
  ) then
    v_out_day_offset := 1;
  end if;

  if v_in_time is not null then
    v_check_in := ((v_date + v_in_day_offset) + v_in_time) at time zone v_timezone;
    v_late := greatest(0, floor(
      extract(epoch from (v_in_time - v_start)) / 60 + v_in_day_offset * 1440
    )::integer);
  end if;
  if v_out_time is not null then
    v_check_out := ((v_date + v_out_day_offset) + v_out_time) at time zone v_timezone;
    v_early := greatest(0, floor(
      extract(epoch from (v_end - v_out_time)) / 60
      + case when v_is_overnight then 1440 else 0 end
      - v_out_day_offset * 1440
    )::integer);
  end if;

  v_pair := v_pair || jsonb_build_object(
    'checkIn', coalesce(to_char(v_in_time, 'HH24:MI'), ''),
    'checkOut', coalesce(to_char(v_out_time, 'HH24:MI'), ''),
    'checkInTimestamp', v_check_in,
    'checkOutTimestamp', v_check_out,
    'lateMinutes', v_late,
    'earlyMinutes', v_early
  );
  v_pairs := jsonb_set(v_pairs, array[v_pair_index::text], v_pair, false);

  select
    coalesce(sum(greatest(0, extract(epoch from (
      (pair ->> 'checkOutTimestamp')::timestamptz - (pair ->> 'checkInTimestamp')::timestamptz
    )) / 60)), 0),
    count(*)::integer
  into v_worked_minutes, v_complete_pair_count
  from jsonb_array_elements(v_pairs) as items(pair)
  where nullif(pair ->> 'checkInTimestamp', '') is not null
    and nullif(pair ->> 'checkOutTimestamp', '') is not null;

  if v_complete_pair_count = 1 then
    v_worked_minutes := greatest(0, v_worked_minutes - v_break_minutes);
  end if;
  v_hours := round(v_worked_minutes / 60, 2);

  v_log_data := v_log_data || jsonb_build_object(
    'punchPairs', v_pairs,
    'checkIn', v_check_in,
    'checkOut', v_check_out,
    'vao', coalesce(to_char(v_in_time, 'HH24:MI'), ''),
    'ra', coalesce(to_char(v_out_time, 'HH24:MI'), ''),
    'lateMinutes', v_late,
    'vaoTre', v_late,
    'earlyMinutes', v_early,
    'raSom', v_early,
    'hours', v_hours,
    'gio', v_hours,
    'tongGio', v_hours,
    'cong', case
      when v_hours >= v_standard_minutes / 60 then 1
      when v_hours >= v_standard_minutes / 120 then 0.5
      else 0
    end,
    'status', case when v_hours >= v_standard_minutes / 60 then 'Đủ' else 'Thiếu' end
  );
  update public.hr_records set data = v_log_data, updated_at = v_now where id = v_log_id;
  return v_result;
end;
$$;

revoke all on function public.decide_attendance_correction(text, text, text) from public;
grant execute on function public.decide_attendance_correction(text, text, text) to anon, authenticated;
