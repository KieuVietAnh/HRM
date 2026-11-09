-- =============================================================================
-- Chấm công online cho CA XUYÊN ĐÊM (ví dụ 22:00 → 05:00 sáng hôm sau).
-- - Tự nhận biết ca đêm khi giờ kết thúc <= giờ bắt đầu.
-- - Check-out sau 00:00 tìm đúng bản ghi Check-in của ngày hôm trước.
-- - Tính giờ / về sớm cộng 24h cho phần qua nửa đêm.
-- - Đọc luôn danh sách ca từ attendanceSettings.shifts để nhận diện ca tuỳ chỉnh.
-- =============================================================================

-- 1) Nhận diện ca: ưu tiên khung giờ trong tên ca, rồi tra cứu settings.shifts
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
  v_shift_name text := btrim(coalesce(p_profile.shift, ''));
  v_identity text := lower(concat_ws(' ',
    coalesce(p_profile.department, ''),
    coalesce(p_profile.position, ''),
    coalesce(p_profile.shift, '')
  ));
  v_range text[];
  v_stored jsonb := coalesce(p_settings -> 'shifts', '{}'::jsonb);
  v_rec record;
  v_in text;
  v_out text;
begin
  -- 1a) Tên ca chứa sẵn khung giờ, ví dụ "Ca Đêm (22:00 - 05:00)"
  v_range := regexp_match(
    v_shift_name,
    '([0-2]?[0-9]:[0-5][0-9])[^0-9]+([0-2]?[0-9]:[0-5][0-9])'
  );
  if v_range is not null and array_length(v_range, 1) >= 2 then
    return jsonb_build_object(
      'name', v_shift_name,
      'standardCheckIn', to_char(v_range[1]::time, 'HH24:MI'),
      'standardCheckOut', to_char(v_range[2]::time, 'HH24:MI')
    );
  end if;

  -- 1b) Tra cứu theo đúng tên / id trong attendanceSettings.shifts
  if v_shift_name <> '' and jsonb_typeof(v_stored) = 'object' then
    for v_rec in select * from jsonb_each(v_stored) loop
      v_in := coalesce(v_rec.value ->> 'standardCheckIn', v_rec.value ->> 'start', '');
      v_out := coalesce(v_rec.value ->> 'standardCheckOut', v_rec.value ->> 'end', '');
      if v_in ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$'
         and v_out ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$'
         and (lower(btrim(coalesce(v_rec.value ->> 'name', ''))) = lower(v_shift_name)
              or v_rec.key = v_shift_name) then
        return jsonb_build_object(
          'name', coalesce(v_rec.value ->> 'name', v_shift_name),
          'standardCheckIn', v_in,
          'standardCheckOut', v_out
        );
      end if;
    end loop;
  end if;

  -- 1c) Sale
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

  -- 1d) Mặc định hành chính
  return jsonb_build_object(
    'name', coalesce(nullif(v_shift_name, ''), 'Ca hành chính'),
    'standardCheckIn', coalesce(nullif(p_settings ->> 'standardCheckIn', ''), '08:30'),
    'standardCheckOut', coalesce(nullif(p_settings ->> 'standardCheckOut', ''), '17:30')
  );
end;
$$;

-- 2) Lấy trạng thái hôm nay (tự nhận biết ca đêm, trả về bản ghi đúng ngày)
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
  v_standard_in time;
  v_standard_out time;
  v_is_overnight boolean;
  v_record_date date;
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
  v_standard_in := (v_shift ->> 'standardCheckIn')::time;
  v_standard_out := (v_shift ->> 'standardCheckOut')::time;
  v_today := (clock_timestamp() at time zone v_timezone)::date;

  v_is_overnight := v_standard_out <= v_standard_in;

  -- Ca đêm: nếu đang ở phần "sáng sớm" (trước giờ kết thúc ca) thì bản ghi
  -- Check-in nằm ở ngày hôm trước.
  if v_is_overnight and ((clock_timestamp() at time zone v_timezone)::time < v_standard_out) then
    v_record_date := v_today - 1;
  else
    v_record_date := v_today;
  end if;

  select data into v_record
  from public.hr_records
  where collection = 'attendanceLogs'
    and data ->> 'employeeId' = v_profile.id::text
    and data ->> 'date' = to_char(v_record_date, 'YYYY-MM-DD')
  order by updated_at desc
  limit 1;

  return jsonb_build_object(
    'date', to_char(v_record_date, 'YYYY-MM-DD'),
    'shiftName', v_shift ->> 'name',
    'standardCheckIn', v_shift ->> 'standardCheckIn',
    'standardCheckOut', v_shift ->> 'standardCheckOut',
    'timezone', v_timezone,
    'record', v_record
  );
end;
$$;

-- 3) Check-out xuyên đêm: tìm đúng bản ghi, cộng 24h cho phần qua nửa đêm
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
  v_standard_in time;
  v_standard_out time;
  v_is_overnight boolean;
  v_record_date date;
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
  v_standard_in := (v_shift ->> 'standardCheckIn')::time;
  v_standard_out := (v_shift ->> 'standardCheckOut')::time;
  v_local := v_now at time zone v_timezone;
  v_today := v_local::date;
  v_time := v_local::time;

  v_is_overnight := v_standard_out <= v_standard_in;

  -- Ngày của bản ghi Check-in: ca đêm + đang sáng sớm → hôm trước
  if v_is_overnight and v_time < v_standard_out then
    v_record_date := v_today - 1;
  else
    v_record_date := v_today;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_profile.id::text || ':' || v_record_date::text));

  select id, data into v_record_id, v_data
  from public.hr_records
  where collection = 'attendanceLogs'
    and data ->> 'employeeId' = v_profile.id::text
    and data ->> 'date' = to_char(v_record_date, 'YYYY-MM-DD')
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

  -- Tổng giờ: cộng 24h khi check-out nằm trước check-in (qua nửa đêm)
  if v_is_overnight and v_time < v_checkin_time then
    v_hours := extract(epoch from ((v_time + interval '24 hours') - v_checkin_time)) / 3600;
  else
    v_hours := extract(epoch from (v_time - v_checkin_time)) / 3600;
  end if;
  v_hours := greatest(0, v_hours);
  -- Trừ giờ nghỉ trưa chỉ áp dụng cho ca ngày, không áp dụng ca đêm
  if not v_is_overnight and v_checkin_time <= time '12:00' and v_time >= time '13:30' then
    v_hours := greatest(0, v_hours - 1.5);
  end if;
  v_hours := round(v_hours, 1);

  -- Về sớm: ca đêm tính mốc kết thúc ở ngày kế tiếp
  if v_is_overnight then
    if v_time < v_standard_in then
      v_early := greatest(0, floor(extract(epoch from (v_standard_out - v_time)) / 60)::integer);
    else
      v_early := greatest(0, floor(extract(epoch from ((v_standard_out + interval '24 hours') - v_time)) / 60)::integer);
    end if;
  else
    v_early := greatest(0, floor(extract(epoch from (v_standard_out - v_time)) / 60)::integer);
  end if;

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
    'date', to_char(v_record_date, 'YYYY-MM-DD'),
    'shiftName', v_shift ->> 'name',
    'standardCheckOut', to_char(v_standard_out, 'HH24:MI'),
    'record', v_data
  );
end;
$$;

-- Phân quyền
revoke all on function public.attendance_shift_for_profile(public.users, jsonb) from public, anon;
grant execute on function public.attendance_shift_for_profile(public.users, jsonb) to authenticated;
revoke all on function public.get_online_attendance_today() from public, anon;
revoke all on function public.employee_online_check_out() from public, anon;
grant execute on function public.get_online_attendance_today() to authenticated;
grant execute on function public.employee_online_check_out() to authenticated;
