-- Use the employee's existing shift/department/position when evaluating
-- attendance. Staff roles use the same online attendance RPCs for demos.

create or replace function public.attendance_shift_for_profile(
  p_profile public.users,
  p_settings jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_identity text := lower(concat_ws(' ',
    coalesce(p_profile.department, ''),
    coalesce(p_profile.position, ''),
    coalesce(p_profile.shift, '')
  ));
  v_match text[];
begin
  v_match := regexp_match(
    coalesce(p_profile.shift, ''),
    '([0-2]?[0-9]:[0-5][0-9])[^0-9]+([0-2]?[0-9]:[0-5][0-9])'
  );

  if v_match is not null and array_length(v_match, 1) >= 2 then
    return jsonb_build_object(
      'name', coalesce(nullif(p_profile.shift, ''), 'Ca nhân viên'),
      'standardCheckIn', to_char(v_match[1]::time, 'HH24:MI'),
      'standardCheckOut', to_char(v_match[2]::time, 'HH24:MI')
    );
  end if;

  if lower(trim(coalesce(p_profile.department, ''))) = 'trang'
    or v_identity ~ '(^|[^a-z])(sale|sales)([^a-z]|$)'
    or v_identity like '%kinh doanh%'
  then
    return jsonb_build_object(
      'name', 'Ca Sale',
      'standardCheckIn', '04:00',
      'standardCheckOut', '13:30'
    );
  end if;

  return jsonb_build_object(
    'name', coalesce(nullif(p_profile.shift, ''), 'Ca hành chính'),
    'standardCheckIn', coalesce(nullif(p_settings ->> 'standardCheckIn', ''), '08:30'),
    'standardCheckOut', coalesce(nullif(p_settings ->> 'standardCheckOut', ''), '17:30')
  );
end;
$$;

create or replace function public.get_online_attendance_today()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.users%rowtype;
  v_timezone text := 'Asia/Ho_Chi_Minh';
  v_today date;
  v_settings jsonb;
  v_shift jsonb;
  v_record jsonb;
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
  v_shift := public.attendance_shift_for_profile(v_profile, v_settings);
  v_today := (clock_timestamp() at time zone v_timezone)::date;

  select data into v_record
  from public.hr_records
  where collection = 'attendanceLogs'
    and data ->> 'employeeId' = v_profile.id::text
    and data ->> 'date' = to_char(v_today, 'YYYY-MM-DD')
  order by updated_at desc
  limit 1;

  return jsonb_build_object(
    'date', to_char(v_today, 'YYYY-MM-DD'),
    'shiftName', v_shift ->> 'name',
    'standardCheckIn', v_shift ->> 'standardCheckIn',
    'standardCheckOut', v_shift ->> 'standardCheckOut',
    'timezone', v_timezone,
    'record', v_record
  );
end;
$$;

create or replace function public.employee_online_check_in()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.users%rowtype;
  v_now timestamptz := clock_timestamp();
  v_timezone text := 'Asia/Ho_Chi_Minh';
  v_local timestamp;
  v_today date;
  v_time time;
  v_settings jsonb;
  v_shift jsonb;
  v_standard time;
  v_late integer;
  v_record_id text;
  v_data jsonb;
  v_day_name text;
begin
  if auth.uid() is null then
    raise exception 'Bạn chưa đăng nhập';
  end if;

  select * into v_profile from public.users where auth_user_id = auth.uid() limit 1;
  if not found then
    raise exception 'Tài khoản chưa liên kết với nhân viên';
  end if;

  select data into v_settings from public.hr_records where id = 'attendanceSettings::default';
  v_timezone := coalesce(nullif(v_settings ->> 'timezone', ''), v_timezone);
  v_shift := public.attendance_shift_for_profile(v_profile, v_settings);
  v_standard := (v_shift ->> 'standardCheckIn')::time;
  v_local := v_now at time zone v_timezone;
  v_today := v_local::date;
  v_time := v_local::time;
  v_late := greatest(0, floor(extract(epoch from (v_time - v_standard)) / 60)::integer);

  perform pg_advisory_xact_lock(hashtext(v_profile.id::text || ':' || v_today::text));

  select id, data into v_record_id, v_data
  from public.hr_records
  where collection = 'attendanceLogs'
    and data ->> 'employeeId' = v_profile.id::text
    and data ->> 'date' = to_char(v_today, 'YYYY-MM-DD')
  order by updated_at desc
  limit 1;

  if v_data is not null and coalesce(v_data ->> 'checkIn', v_data ->> 'vao', '') <> '' then
    raise exception 'Hôm nay bạn đã Check-in';
  end if;

  v_record_id := coalesce(v_record_id, 'attendanceLogs::online_' || v_profile.id::text || '_' || to_char(v_today, 'YYYYMMDD'));
  v_day_name := case extract(isodow from v_today)
    when 1 then 'Thứ 2' when 2 then 'Thứ 3' when 3 then 'Thứ 4'
    when 4 then 'Thứ 5' when 5 then 'Thứ 6' when 6 then 'Thứ 7'
    else 'Chủ nhật' end;

  v_data := coalesce(v_data, '{}'::jsonb) || jsonb_build_object(
    'employeeId', v_profile.id::text,
    'employeeCode', coalesce(v_profile.employee_id, v_profile.username, ''),
    'employeeName', coalesce(v_profile.name, ''),
    'department', coalesce(v_profile.department, ''),
    'position', coalesce(v_profile.position, ''),
    'shiftName', v_shift ->> 'name',
    'date', to_char(v_today, 'YYYY-MM-DD'),
    'dayOfWeek', v_day_name,
    'timestamp', v_now,
    'checkIn', v_now,
    'checkOut', null,
    'vao', to_char(v_time, 'HH24:MI'),
    'ra', '',
    'lateMinutes', v_late,
    'vaoTre', v_late,
    'earlyMinutes', 0,
    'raSom', 0,
    'hours', 0,
    'gio', 0,
    'tongGio', 0,
    'cong', 0,
    'workMode', 'online',
    'source', 'employee-online',
    'status', 'Đang làm'
  );

  insert into public.hr_records (id, collection, data, updated_at)
  values (v_record_id, 'attendanceLogs', v_data, v_now)
  on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at;

  return jsonb_build_object(
    'date', to_char(v_today, 'YYYY-MM-DD'),
    'shiftName', v_shift ->> 'name',
    'standardCheckIn', to_char(v_standard, 'HH24:MI'),
    'record', v_data
  );
end;
$$;

create or replace function public.employee_online_check_out()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.users%rowtype;
  v_now timestamptz := clock_timestamp();
  v_timezone text := 'Asia/Ho_Chi_Minh';
  v_local timestamp;
  v_today date;
  v_time time;
  v_settings jsonb;
  v_shift jsonb;
  v_standard time;
  v_early integer;
  v_record_id text;
  v_data jsonb;
  v_checkin_time time;
  v_hours numeric;
begin
  if auth.uid() is null then
    raise exception 'Bạn chưa đăng nhập';
  end if;

  select * into v_profile from public.users where auth_user_id = auth.uid() limit 1;
  if not found then
    raise exception 'Tài khoản chưa liên kết với nhân viên';
  end if;

  select data into v_settings from public.hr_records where id = 'attendanceSettings::default';
  v_timezone := coalesce(nullif(v_settings ->> 'timezone', ''), v_timezone);
  v_shift := public.attendance_shift_for_profile(v_profile, v_settings);
  v_standard := (v_shift ->> 'standardCheckOut')::time;
  v_local := v_now at time zone v_timezone;
  v_today := v_local::date;
  v_time := v_local::time;
  v_early := greatest(0, floor(extract(epoch from (v_standard - v_time)) / 60)::integer);

  perform pg_advisory_xact_lock(hashtext(v_profile.id::text || ':' || v_today::text));

  select id, data into v_record_id, v_data
  from public.hr_records
  where collection = 'attendanceLogs'
    and data ->> 'employeeId' = v_profile.id::text
    and data ->> 'date' = to_char(v_today, 'YYYY-MM-DD')
  order by updated_at desc
  limit 1;

  if v_data is null or coalesce(v_data ->> 'checkIn', v_data ->> 'vao', '') = '' then
    raise exception 'Bạn cần Check-in trước';
  end if;
  if coalesce(v_data ->> 'checkOut', v_data ->> 'ra', '') <> '' then
    raise exception 'Hôm nay bạn đã Check-out';
  end if;

  begin
    if coalesce(v_data ->> 'vao', '') ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]' then
      v_checkin_time := (v_data ->> 'vao')::time;
    else
      v_checkin_time := ((v_data ->> 'checkIn')::timestamptz at time zone v_timezone)::time;
    end if;
  exception when others then
    v_checkin_time := v_time;
  end;

  v_hours := greatest(0, extract(epoch from (v_time - v_checkin_time)) / 3600);
  if v_checkin_time <= time '12:00' and v_time >= time '13:30' then
    v_hours := greatest(0, v_hours - 1.5);
  end if;
  v_hours := round(v_hours, 1);

  v_data := v_data || jsonb_build_object(
    'shiftName', v_shift ->> 'name',
    'checkOut', v_now,
    'ra', to_char(v_time, 'HH24:MI'),
    'earlyMinutes', v_early,
    'raSom', v_early,
    'hours', v_hours,
    'gio', v_hours,
    'tongGio', v_hours,
    'cong', case when v_hours >= 7.5 then 1 when v_hours >= 3 then 0.5 else 0 end,
    'status', case when v_hours >= 7.5 then 'Đủ' else 'Thiếu' end
  );

  update public.hr_records set data = v_data, updated_at = v_now where id = v_record_id;

  return jsonb_build_object(
    'date', to_char(v_today, 'YYYY-MM-DD'),
    'shiftName', v_shift ->> 'name',
    'standardCheckOut', to_char(v_standard, 'HH24:MI'),
    'record', v_data
  );
end;
$$;

revoke all on function public.attendance_shift_for_profile(public.users, jsonb) from public, anon;
grant execute on function public.attendance_shift_for_profile(public.users, jsonb) to authenticated;
revoke all on function public.get_online_attendance_today() from public, anon;
revoke all on function public.employee_online_check_in() from public, anon;
revoke all on function public.employee_online_check_out() from public, anon;
grant execute on function public.get_online_attendance_today() to authenticated;
grant execute on function public.employee_online_check_in() to authenticated;
grant execute on function public.employee_online_check_out() to authenticated;
