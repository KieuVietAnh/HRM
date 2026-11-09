-- Allow multiple approved shifts per employee and work date. Existing one-shift
-- registrations remain valid because the new key includes shift_id.
alter table public.employee_shift_registrations
  drop constraint if exists shift_registrations_unique_day;

alter table public.employee_shift_registrations
  add constraint shift_registrations_unique_day_shift
  unique (company_id, employee_id, work_date, shift_id);

-- Return the employee's approved shifts for today, plus an overnight shift
-- from yesterday while it is still in progress. Employees without registrations
-- keep using the shift resolved from their profile.
create or replace function public.get_online_attendance_today()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.users%rowtype;
  v_settings jsonb;
  v_timezone text := 'Asia/Ho_Chi_Minh';
  v_local timestamp;
  v_today date;
  v_shift jsonb;
  v_work_date date;
  v_record jsonb;
  v_shifts jsonb := '[]'::jsonb;
  v_has_today_registration boolean := false;
  v_has_previous_shift boolean := false;
  v_has_open_pair boolean;
  v_reg record;
  v_start time;
  v_end time;
  v_shift_id text;
  v_record_id text;
begin
  if auth.uid() is null then
    raise exception 'Bạn chưa đăng nhập';
  end if;

  select * into v_profile from public.users where auth_user_id = auth.uid() limit 1;
  if not found then
    raise exception 'Tài khoản chưa liên kết với nhân viên';
  end if;

  select data into v_settings
  from public.hr_records
  where id = 'attendanceSettings::default';

  v_timezone := coalesce(nullif(v_settings ->> 'timezone', ''), v_timezone);
  v_local := clock_timestamp() at time zone v_timezone;
  v_today := v_local::date;
  select exists (
    select 1 from public.employee_shift_registrations
    where employee_id = v_profile.id and status in ('pending', 'approved') and work_date = v_today
  ) into v_has_today_registration;

  for v_reg in
    select shift_id, shift_name, start_time, end_time, work_date
    from public.employee_shift_registrations
    where employee_id = v_profile.id
      and status = 'approved'
      and shift_id <> 'off'
      and nullif(start_time, '') is not null
      and nullif(end_time, '') is not null
      and work_date between v_today - 1 and v_today
    order by work_date desc, start_time
  loop
    v_work_date := v_reg.work_date;
    v_shift_id := v_reg.shift_id;
    v_start := nullif(v_reg.start_time, '')::time;
    v_end := nullif(v_reg.end_time, '')::time;
    if v_work_date = v_today - 1 then
      if v_start is null or v_end is null or v_end > v_start then
        continue;
      end if;
      select id, data into v_record_id, v_record
      from public.hr_records
      where collection = 'attendanceLogs'
        and data ->> 'employeeId' = v_profile.id::text
        and data ->> 'date' = to_char(v_work_date, 'YYYY-MM-DD')
        and data ->> 'shiftId' = v_shift_id
      order by updated_at desc
      limit 1;
      select exists (
        select 1
        from jsonb_array_elements(coalesce(v_record -> 'punchPairs', '[]'::jsonb)) as pairs(pair)
        where coalesce(pair ->> 'checkIn', '') <> ''
          and coalesce(pair ->> 'checkOut', '') = ''
      ) into v_has_open_pair;
      if not v_has_open_pair then
        v_has_open_pair := coalesce(v_record ->> 'vao', '') <> '' and coalesce(v_record ->> 'ra', '') = '';
      end if;
      if not v_has_open_pair and v_local::time >= v_end then
        continue;
      end if;
      v_has_previous_shift := true;
    else
      select id, data into v_record_id, v_record
      from public.hr_records
      where collection = 'attendanceLogs'
        and data ->> 'employeeId' = v_profile.id::text
        and data ->> 'date' = to_char(v_work_date, 'YYYY-MM-DD')
        and data ->> 'shiftId' = v_shift_id
      order by updated_at desc
      limit 1;
    end if;

    v_shifts := v_shifts || jsonb_build_array(jsonb_build_object(
      'shiftId', v_shift_id,
      'workDate', to_char(v_work_date, 'YYYY-MM-DD'),
      'name', v_reg.shift_name,
      'standardCheckIn', to_char(v_start, 'HH24:MI'),
      'standardCheckOut', to_char(v_end, 'HH24:MI'),
      'record', v_record
    ));
    v_record := null;
    v_record_id := null;
  end loop;

  if not v_has_today_registration and not v_has_previous_shift then
    v_shift := public.attendance_shift_for_profile(v_profile, v_settings);
    v_start := (v_shift ->> 'standardCheckIn')::time;
    v_end := (v_shift ->> 'standardCheckOut')::time;
    v_work_date := v_today;
    if v_end <= v_start and v_local::time < v_end then
      v_work_date := v_today - 1;
    end if;
    v_shift_id := '__profile__';

    select id, data into v_record_id, v_record
    from public.hr_records
    where collection = 'attendanceLogs'
      and data ->> 'employeeId' = v_profile.id::text
      and data ->> 'date' = to_char(v_work_date, 'YYYY-MM-DD')
      and (
        data ->> 'shiftId' = v_shift_id
        or (data ->> 'source' = 'employee-online' and data ->> 'shiftId' is null)
      )
    order by updated_at desc
    limit 1;

    v_shifts := v_shifts || jsonb_build_array(jsonb_build_object(
      'shiftId', v_shift_id,
      'workDate', to_char(v_work_date, 'YYYY-MM-DD'),
      'name', v_shift ->> 'name',
      'standardCheckIn', v_shift ->> 'standardCheckIn',
      'standardCheckOut', v_shift ->> 'standardCheckOut',
      'record', v_record
    ));
  end if;

  return jsonb_build_object(
    'date', to_char(v_today, 'YYYY-MM-DD'),
    'timezone', v_timezone,
    'shifts', v_shifts,
    'record', v_shifts -> 0 -> 'record',
    'shiftName', v_shifts -> 0 ->> 'name',
    'standardCheckIn', v_shifts -> 0 ->> 'standardCheckIn',
    'standardCheckOut', v_shifts -> 0 ->> 'standardCheckOut'
  );
end;
$$;

-- One row per employee, date, and shift. punchPairs carries repeated in/out
-- cycles, with timestamps and evidence attached to the individual punch.
create or replace function public.employee_online_attendance_punch(
  p_work_date date,
  p_shift_id text,
  p_action text,
  p_photo text default null,
  p_location jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.users%rowtype;
  v_now timestamptz := clock_timestamp();
  v_settings jsonb;
  v_timezone text := 'Asia/Ho_Chi_Minh';
  v_local timestamp;
  v_today date;
  v_work_day_offset integer;
  v_shift jsonb;
  v_shift_name text;
  v_start time;
  v_end time;
  v_is_overnight boolean;
  v_record_id text;
  v_data jsonb;
  v_pairs jsonb;
  v_pair jsonb;
  v_open_index bigint;
  v_now_time time;
  v_late integer := 0;
  v_early integer := 0;
  v_total_late integer := 0;
  v_total_early integer := 0;
  v_has_previous_check_in boolean := false;
  v_hours numeric := 0;
  v_day_name text;
begin
  if auth.uid() is null then
    raise exception 'Bạn chưa đăng nhập';
  end if;
  if p_work_date is null or nullif(btrim(coalesce(p_shift_id, '')), '') is null then
    raise exception 'Thiếu ca hoặc ngày chấm công';
  end if;
  if p_action is null or p_action not in ('in', 'out') then
    raise exception 'Lượt chấm công không hợp lệ';
  end if;

  select * into v_profile from public.users where auth_user_id = auth.uid() limit 1;
  if not found then
    raise exception 'Tài khoản chưa liên kết với nhân viên';
  end if;

  select data into v_settings
  from public.hr_records
  where id = 'attendanceSettings::default';
  v_timezone := coalesce(nullif(v_settings ->> 'timezone', ''), v_timezone);
  v_local := v_now at time zone v_timezone;
  v_today := v_local::date;
  v_now_time := v_local::time;
  v_work_day_offset := v_today - p_work_date;
  if v_work_day_offset not between 0 and 1 then
    raise exception 'Ngày ca không hợp lệ';
  end if;

  if p_shift_id = '__profile__' then
    if exists (
      select 1 from public.employee_shift_registrations
      where employee_id = v_profile.id
        and work_date = p_work_date
        and shift_id = 'off'
        and status = 'approved'
    ) then
      raise exception 'Bạn đã đăng ký nghỉ cho ngày này';
    end if;
    if exists (
      select 1 from public.employee_shift_registrations
      where employee_id = v_profile.id
        and work_date = p_work_date
        and status in ('pending', 'approved')
    ) then
      raise exception 'Hãy chọn ca đã được duyệt trong lịch của bạn';
    end if;
    v_shift := public.attendance_shift_for_profile(v_profile, v_settings);
    v_shift_name := v_shift ->> 'name';
    v_start := (v_shift ->> 'standardCheckIn')::time;
    v_end := (v_shift ->> 'standardCheckOut')::time;
  else
    select shift_name, nullif(start_time, '')::time, nullif(end_time, '')::time
      into v_shift_name, v_start, v_end
    from public.employee_shift_registrations
    where employee_id = v_profile.id
      and work_date = p_work_date
      and shift_id = p_shift_id
      and status = 'approved'
    limit 1;
    if not found then
      raise exception 'Ca này chưa được duyệt hoặc không thuộc lịch của bạn';
    end if;
  end if;
  if v_start is null or v_end is null then
    raise exception 'Ca làm chưa có giờ bắt đầu/kết thúc hợp lệ';
  end if;

  v_is_overnight := v_end <= v_start;
  if p_action = 'in' then
    if p_work_date = v_today - 1 then
      if not v_is_overnight or v_now_time >= v_end then
        raise exception 'Không thể check-in cho ngày ca này';
      end if;
    elsif p_work_date <> v_today then
      raise exception 'Không thể check-in cho ngày ca này';
    end if;
  elsif p_work_date = v_today - 1 and not v_is_overnight then
    raise exception 'Không tìm thấy ca đang mở để check-out';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_profile.id::text || ':' || p_work_date::text || ':' || p_shift_id));

  select id, data into v_record_id, v_data
  from public.hr_records
  where collection = 'attendanceLogs'
    and data ->> 'employeeId' = v_profile.id::text
    and data ->> 'date' = to_char(p_work_date, 'YYYY-MM-DD')
    and (
      data ->> 'shiftId' = p_shift_id
      or (p_shift_id = '__profile__' and data ->> 'source' = 'employee-online' and data ->> 'shiftId' is null)
    )
  order by updated_at desc
  limit 1;

  v_pairs := coalesce(v_data -> 'punchPairs', '[]'::jsonb);
  if jsonb_typeof(v_pairs) <> 'array' then
    v_pairs := '[]'::jsonb;
  end if;

  -- Convert a legacy one-pair online row before adding the next punch.
  if jsonb_array_length(v_pairs) = 0 and coalesce(v_data ->> 'vao', v_data ->> 'checkIn', '') <> '' then
    v_pair := jsonb_build_object(
      'checkIn', coalesce(v_data ->> 'vao', to_char((v_data ->> 'checkIn')::timestamptz at time zone v_timezone, 'HH24:MI')),
      'checkOut', coalesce(v_data ->> 'ra', ''),
      'checkInTimestamp', v_data -> 'checkIn',
      'checkOutTimestamp', v_data -> 'checkOut',
      'shiftId', coalesce(v_data ->> 'shiftId', p_shift_id),
      'shiftName', coalesce(v_data ->> 'shiftName', v_shift_name),
      'lateMinutes', coalesce(v_data -> 'lateMinutes', v_data -> 'vaoTre', '0'::jsonb),
      'earlyMinutes', coalesce(v_data -> 'earlyMinutes', v_data -> 'raSom', '0'::jsonb),
      'checkInLocation', v_data -> 'checkInLocation',
      'checkOutLocation', v_data -> 'checkOutLocation',
      'checkInPhoto', v_data -> 'checkInPhoto',
      'checkOutPhoto', v_data -> 'checkOutPhoto'
    );
    v_pairs := jsonb_build_array(v_pair);
  end if;

  select max(ordinality) into v_open_index
  from jsonb_array_elements(v_pairs) with ordinality as items(pair, ordinality)
  where coalesce(pair ->> 'checkIn', '') <> ''
    and coalesce(pair ->> 'checkOut', '') = '';

  select exists (
    select 1 from jsonb_array_elements(v_pairs) as items(pair)
    where coalesce(pair ->> 'checkIn', '') <> ''
  ) into v_has_previous_check_in;

  if p_action = 'in' then
    if v_open_index is not null then
      raise exception 'Bạn cần check-out ca đang mở trước khi check-in tiếp';
    end if;

    if jsonb_array_length(v_pairs) > 0 then
      v_pairs := jsonb_set(
        v_pairs,
        array[(jsonb_array_length(v_pairs) - 1)::text],
        (v_pairs -> (jsonb_array_length(v_pairs) - 1)) || jsonb_build_object('earlyMinutes', 0),
        false
      );
    end if;

    v_late := greatest(0, floor(
      extract(epoch from (v_now_time - v_start)) / 60
      + case when v_work_day_offset = 1 then 1440 else 0 end
    )::integer);
    v_pair := jsonb_build_object(
      'checkIn', to_char(v_now_time, 'HH24:MI'),
      'checkOut', '',
      'checkInTimestamp', v_now,
      'checkOutTimestamp', null,
      'shiftId', p_shift_id,
      'shiftName', v_shift_name,
      'lateMinutes', case when v_has_previous_check_in then 0 else v_late end,
      'earlyMinutes', 0,
      'checkInLocation', p_location,
      'checkInPhoto', p_photo
    );
    v_pairs := v_pairs || jsonb_build_array(v_pair);
  else
    if v_open_index is null then
      raise exception 'Bạn cần Check-in trước';
    end if;
    v_early := greatest(0, floor(
      extract(epoch from (v_end - v_now_time)) / 60
      + case when v_is_overnight then 1440 - v_work_day_offset * 1440 else 0 end
    )::integer);
    select jsonb_agg(
      case when ordinality = v_open_index then
        pair || jsonb_build_object(
          'checkOut', to_char(v_now_time, 'HH24:MI'),
          'checkOutTimestamp', v_now,
          'earlyMinutes', v_early,
          'checkOutLocation', p_location,
          'checkOutPhoto', p_photo
        )
      else pair end
      order by ordinality
    ) into v_pairs
    from jsonb_array_elements(v_pairs) with ordinality as items(pair, ordinality);
  end if;

  select coalesce(nullif(pair ->> 'lateMinutes', '')::integer, 0)
    into v_total_late
  from jsonb_array_elements(v_pairs) with ordinality as items(pair, ordinality)
  where coalesce(pair ->> 'checkIn', '') <> ''
  order by ordinality
  limit 1;
  select coalesce(nullif(pair ->> 'earlyMinutes', '')::integer, 0)
    into v_total_early
  from jsonb_array_elements(v_pairs) with ordinality as items(pair, ordinality)
  where coalesce(pair ->> 'checkOut', '') <> ''
  order by ordinality desc
  limit 1;
  v_total_late := coalesce(v_total_late, 0);
  v_total_early := coalesce(v_total_early, 0);

  select coalesce(sum(greatest(0,
    extract(epoch from ((pair ->> 'checkOutTimestamp')::timestamptz - (pair ->> 'checkInTimestamp')::timestamptz)) / 3600
  )), 0)
    into v_hours
  from jsonb_array_elements(v_pairs) as pairs(pair)
  where nullif(pair ->> 'checkInTimestamp', '') is not null
    and nullif(pair ->> 'checkOutTimestamp', '') is not null;

  v_record_id := coalesce(v_record_id,
    'attendanceLogs::online_' || v_profile.id::text || '_' || to_char(p_work_date, 'YYYYMMDD') || '_' ||
    regexp_replace(p_shift_id, '[^a-zA-Z0-9_-]', '_', 'g'));
  v_day_name := case extract(isodow from p_work_date)
    when 1 then 'Thứ 2' when 2 then 'Thứ 3' when 3 then 'Thứ 4'
    when 4 then 'Thứ 5' when 5 then 'Thứ 6' when 6 then 'Thứ 7'
    else 'Chủ nhật' end;

  v_data := coalesce(v_data, '{}'::jsonb) || jsonb_build_object(
    'employeeId', v_profile.id::text,
    'employeeCode', coalesce(v_profile.employee_id, v_profile.username, ''),
    'employeeName', coalesce(v_profile.name, ''),
    'department', coalesce(v_profile.department, ''),
    'position', coalesce(v_profile.position, ''),
    'shiftId', p_shift_id,
    'shiftName', v_shift_name,
    'standardCheckIn', to_char(v_start, 'HH24:MI'),
    'standardCheckOut', to_char(v_end, 'HH24:MI'),
    'date', to_char(p_work_date, 'YYYY-MM-DD'),
    'dayOfWeek', v_day_name,
    'timestamp', coalesce(v_data -> 'timestamp', to_jsonb(v_now)),
    'punchPairs', v_pairs,
    'lateMinutes', v_total_late,
    'vaoTre', v_total_late,
    'earlyMinutes', v_total_early,
    'raSom', v_total_early,
    'hours', round(v_hours, 2),
    'gio', round(v_hours, 2),
    'tongGio', round(v_hours, 2),
    'cong', case when v_hours >= 7.5 then 1 when v_hours >= 3 then 0.5 else 0 end,
    'workMode', 'online',
    'source', 'employee-online',
    'calculationMode', 'online-multiple',
    'status', case when p_action = 'in' then 'Đang làm' else case when v_hours >= 7.5 then 'Đủ' else 'Thiếu' end end
  );

  if p_action = 'in' then
    v_data := v_data || jsonb_build_object(
      'checkIn', v_now,
      'checkOut', null,
      'vao', to_char(v_now_time, 'HH24:MI'),
      'ra', ''
    );
  else
    v_data := v_data || jsonb_build_object(
      'checkOut', v_now,
      'ra', to_char(v_now_time, 'HH24:MI')
    );
  end if;

  insert into public.hr_records (id, collection, data, updated_at)
  values (v_record_id, 'attendanceLogs', v_data, v_now)
  on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at;

  return jsonb_build_object(
    'date', to_char(p_work_date, 'YYYY-MM-DD'),
    'recordId', substring(v_record_id from length('attendanceLogs::') + 1),
    'shiftId', p_shift_id,
    'shiftName', v_shift_name,
    'standardCheckIn', to_char(v_start, 'HH24:MI'),
    'standardCheckOut', to_char(v_end, 'HH24:MI'),
    'record', v_data
  );
end;
$$;

revoke all on function public.employee_online_attendance_punch(date, text, text, text, jsonb) from public, anon;
grant execute on function public.employee_online_attendance_punch(date, text, text, text, jsonb) to authenticated;
revoke all on function public.get_online_attendance_today() from public, anon;
grant execute on function public.get_online_attendance_today() to authenticated;
