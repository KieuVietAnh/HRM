-- Synthetic accounts and attendance fixtures for local Supabase only.
-- Loaded by `supabase db reset` after the migrations in this project.

insert into public.users (
  id, employee_id, username, email, password, name, role,
  department, position, shift, branch, employment_status, status
)
values
  ('10000000-0000-0000-0000-000000000001', 'LOCAL-ADMIN', 'local-admin', 'admin@example.test', 'LocalTest!2026', 'Demo Admin', 'admin', 'Nhân sự', 'HR Admin', 'Ca hành chính', 'Local', 'Đang làm', 'Đang làm'),
  ('10000000-0000-0000-0000-000000000002', 'LOCAL-HR', 'local-hr', 'hr@example.test', 'LocalTest!2026', 'Demo HR', 'hr', 'Nhân sự', 'HR', 'Ca hành chính', 'Local', 'Đang làm', 'Đang làm'),
  ('10000000-0000-0000-0000-000000000003', 'LOCAL-MANAGER', 'local-manager', 'manager@example.test', 'LocalTest!2026', 'Demo Manager', 'manager', 'Vận hành', 'Quản lý', 'Ca hành chính', 'Local', 'Đang làm', 'Đang làm'),
  ('10000000-0000-0000-0000-000000000004', 'LOCAL-SALE', 'local-sale', 'sale@example.test', 'LocalTest!2026', 'Demo Sale', 'user', 'Kinh doanh', 'Sale', 'Ca ngày', 'Local', 'Đang làm', 'Đang làm'),
  ('10000000-0000-0000-0000-000000000005', 'LOCAL-NIGHT', 'local-night', 'night@example.test', 'LocalTest!2026', 'Demo Night Shift', 'user', 'Vận hành', 'Nhân viên vận hành', 'Ca đêm 22:00 - 06:00', 'Local', 'Đang làm', 'Đang làm')
on conflict (id) do update set
  employee_id = excluded.employee_id,
  username = excluded.username,
  email = excluded.email,
  password = excluded.password,
  name = excluded.name,
  role = excluded.role,
  department = excluded.department,
  position = excluded.position,
  shift = excluded.shift,
  branch = excluded.branch,
  employment_status = excluded.employment_status,
  status = excluded.status,
  updated_at = now();

insert into public.hr_records (id, collection, data, updated_at)
values (
  'attendanceSettings::default',
  'attendanceSettings',
  jsonb_build_object(
    'timezone', 'Asia/Ho_Chi_Minh',
    'standardWorkMinutes', 480,
    'unpaidBreakMinutes', 90,
    'standardCheckIn', '08:30',
    'standardCheckOut', '17:30',
    'overtime', jsonb_build_object('autoCalculate', true),
    'shifts', jsonb_build_object(
      'administrative', jsonb_build_object('id', 'administrative', 'name', 'Ca hành chính', 'standardCheckIn', '08:30', 'standardCheckOut', '17:30'),
      'saleMorning', jsonb_build_object('id', 'saleMorning', 'name', 'Ca sáng Sale', 'standardCheckIn', '04:00', 'standardCheckOut', '13:30'),
      'lateMorning', jsonb_build_object('id', 'lateMorning', 'name', 'Ca 08:00', 'standardCheckIn', '08:00', 'standardCheckOut', '16:00'),
      'evening', jsonb_build_object('id', 'evening', 'name', 'Ca chiều', 'standardCheckIn', '14:00', 'standardCheckOut', '18:00'),
      'night', jsonb_build_object('id', 'night', 'name', 'Ca đêm', 'standardCheckIn', '22:00', 'standardCheckOut', '06:00')
    )
  ),
  now()
)
on conflict (id) do update set
  collection = excluded.collection,
  data = excluded.data,
  updated_at = now();

do $$
declare
  v_today date;
  v_yesterday date;
  v_tomorrow date;
  v_active_work_date date;
  v_local_now timestamp;
  v_active_start time;
  v_active_end time;
  v_active_in time;
  v_active_in_at timestamptz;
  v_active_late integer;
  v_day_name text;
  v_active_day_name text;
  v_sale_id uuid := '10000000-0000-0000-0000-000000000004';
  v_night_id uuid := '10000000-0000-0000-0000-000000000005';
  v_sale_name text := 'Demo Sale';
  v_night_name text := 'Demo Night Shift';
  v_early_log_id text;
  v_active_log_id text;
  v_night_log_id text;
  v_early_in timestamptz;
  v_early_out timestamptz;
  v_late_in timestamptz;
  v_late_out timestamptz;
  v_night_in timestamptz;
  v_night_out timestamptz;
begin
  v_local_now := now() at time zone 'Asia/Ho_Chi_Minh';
  v_today := v_local_now::date;
  v_yesterday := v_today - 1;
  v_tomorrow := v_today + 1;
  v_active_start := (v_local_now::time - interval '2 hours')::time;
  v_active_end := (v_local_now::time + interval '3 hours')::time;
  v_active_in := (v_local_now::time - interval '30 minutes')::time;
  v_active_in_at := ((v_local_now - interval '30 minutes') at time zone 'Asia/Ho_Chi_Minh');
  v_active_late := 90;
  v_active_work_date := case
    when v_active_end <= v_active_start and v_local_now::time < v_active_end then v_yesterday
    else v_today
  end;
  v_day_name := case extract(isodow from v_today)
    when 1 then 'Thứ 2' when 2 then 'Thứ 3' when 3 then 'Thứ 4'
    when 4 then 'Thứ 5' when 5 then 'Thứ 6' when 6 then 'Thứ 7'
    else 'Chủ nhật' end;
  v_active_day_name := case extract(isodow from v_active_work_date)
    when 1 then 'Thứ 2' when 2 then 'Thứ 3' when 3 then 'Thứ 4'
    when 4 then 'Thứ 5' when 5 then 'Thứ 6' when 6 then 'Thứ 7'
    else 'Chủ nhật' end;

  delete from public.hr_records
  where id like 'attendanceLogs::demo-%'
     or id like 'attendanceLogs::online_10000000-0000-0000-0000-000000000004-%'
     or id = 'attendanceCorrectionRequests::90000000-0000-0000-0000-000000000001';

  delete from public.employee_shift_registrations
  where id in (
    '11000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000002',
    '11000000-0000-0000-0000-000000000003',
    '11000000-0000-0000-0000-000000000004',
    '11000000-0000-0000-0000-000000000005'
  );

  insert into public.employee_shift_registrations (
    id, company_id, employee_id, employee_name, work_date,
    shift_id, shift_name, start_time, end_time, status
  ) values
    ('11000000-0000-0000-0000-000000000001', 'speego-original', v_sale_id, v_sale_name, v_today, 'lateMorning', 'Ca 08:00', '08:00', '16:00', 'pending'),
    ('11000000-0000-0000-0000-000000000002', 'speego-original', v_sale_id, v_sale_name, v_active_work_date, 'demo-active', 'Ca test đang mở', to_char(v_active_start, 'HH24:MI'), to_char(v_active_end, 'HH24:MI'), 'pending'),
    ('11000000-0000-0000-0000-000000000003', 'speego-original', v_sale_id, v_sale_name, v_tomorrow, 'evening', 'Ca chiều', '14:00', '18:00', 'pending'),
    ('11000000-0000-0000-0000-000000000004', 'speego-original', v_night_id, v_night_name, v_today, 'night', 'Ca đêm', '22:00', '06:00', 'pending'),
    ('11000000-0000-0000-0000-000000000005', 'speego-original', v_night_id, v_night_name, v_yesterday, 'night', 'Ca đêm', '22:00', '06:00', 'pending');

  update public.employee_shift_registrations
  set status = 'approved'
  where id in (
    '11000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000002',
    '11000000-0000-0000-0000-000000000004',
    '11000000-0000-0000-0000-000000000005'
  );

  v_early_log_id := 'attendanceLogs::demo-sale-nearest-' || to_char(v_yesterday, 'YYYYMMDD');
  v_early_in := ((v_yesterday + time '05:55') at time zone 'Asia/Ho_Chi_Minh');
  v_early_out := ((v_yesterday + time '13:10') at time zone 'Asia/Ho_Chi_Minh');
  insert into public.hr_records (id, collection, data, updated_at)
  values (
    v_early_log_id,
    'attendanceLogs',
    jsonb_build_object(
      'employeeId', v_sale_id,
      'employeeCode', 'LOCAL-SALE',
      'employeeName', v_sale_name,
      'department', 'Kinh doanh',
      'position', 'Sale',
      'date', to_char(v_yesterday, 'YYYY-MM-DD'),
      'dayOfWeek', case extract(isodow from v_yesterday)
        when 1 then 'Thứ 2' when 2 then 'Thứ 3' when 3 then 'Thứ 4'
        when 4 then 'Thứ 5' when 5 then 'Thứ 6' when 6 then 'Thứ 7'
        else 'Chủ nhật' end,
      'checkIn', v_early_in,
      'checkOut', v_early_out,
      'vao', '05:55',
      'ra', '13:10',
      'hours', 7.25,
      'gio', 7.25,
      'tongGio', 7.25,
      'cong', 1,
      'lateMinutes', 0,
      'earlyMinutes', 20,
      'workMode', 'onsite',
      'source', 'local-demo'
    ),
    now()
  );

  v_early_log_id := 'attendanceLogs::online_' || v_sale_id::text || '_' || to_char(v_today, 'YYYYMMDD') || '_lateMorning';
  v_early_in := ((v_today + time '08:15') at time zone 'Asia/Ho_Chi_Minh');
  v_early_out := ((v_today + time '12:00') at time zone 'Asia/Ho_Chi_Minh');
  v_late_in := ((v_today + time '13:30') at time zone 'Asia/Ho_Chi_Minh');
  v_late_out := ((v_today + time '16:05') at time zone 'Asia/Ho_Chi_Minh');
  insert into public.hr_records (id, collection, data, updated_at)
  values (
    v_early_log_id,
    'attendanceLogs',
    jsonb_build_object(
      'employeeId', v_sale_id,
      'employeeCode', 'LOCAL-SALE',
      'employeeName', v_sale_name,
      'department', 'Kinh doanh',
      'position', 'Sale',
      'shiftId', 'lateMorning',
      'shiftName', 'Ca 08:00',
      'standardCheckIn', '08:00',
      'standardCheckOut', '16:00',
      'date', to_char(v_today, 'YYYY-MM-DD'),
      'dayOfWeek', v_day_name,
      'checkIn', v_late_in,
      'checkOut', v_late_out,
      'vao', '13:30',
      'ra', '16:05',
      'punchPairs', jsonb_build_array(
        jsonb_build_object('checkIn', '08:15', 'checkOut', '12:00', 'checkInTimestamp', v_early_in, 'checkOutTimestamp', v_early_out, 'shiftId', 'lateMorning', 'shiftName', 'Ca 08:00', 'lateMinutes', 15, 'earlyMinutes', 0),
        jsonb_build_object('checkIn', '13:30', 'checkOut', '16:05', 'checkInTimestamp', v_late_in, 'checkOutTimestamp', v_late_out, 'shiftId', 'lateMorning', 'shiftName', 'Ca 08:00', 'lateMinutes', 0, 'earlyMinutes', 0)
      ),
      'hours', 6.33,
      'gio', 6.33,
      'tongGio', 6.33,
      'cong', 0.5,
      'lateMinutes', 15,
      'vaoTre', 15,
      'earlyMinutes', 0,
      'raSom', 0,
      'workMode', 'online',
      'source', 'employee-online',
      'calculationMode', 'online-multiple',
      'status', 'Thiếu'
    ),
    now()
  );

  v_active_log_id := 'attendanceLogs::online_' || v_sale_id::text || '_' || to_char(v_active_work_date, 'YYYYMMDD') || '_demo-active';
  insert into public.hr_records (id, collection, data, updated_at)
  values (
    v_active_log_id,
    'attendanceLogs',
    jsonb_build_object(
      'employeeId', v_sale_id,
      'employeeCode', 'LOCAL-SALE',
      'employeeName', v_sale_name,
      'department', 'Kinh doanh',
      'position', 'Sale',
      'shiftId', 'demo-active',
      'shiftName', 'Ca test đang mở',
      'standardCheckIn', to_char(v_active_start, 'HH24:MI'),
      'standardCheckOut', to_char(v_active_end, 'HH24:MI'),
      'date', to_char(v_active_work_date, 'YYYY-MM-DD'),
      'dayOfWeek', v_active_day_name,
      'checkIn', v_active_in_at,
      'checkOut', null,
      'vao', to_char(v_active_in, 'HH24:MI'),
      'ra', '',
      'punchPairs', jsonb_build_array(
        jsonb_build_object('checkIn', to_char(v_active_in, 'HH24:MI'), 'checkOut', '', 'checkInTimestamp', v_active_in_at, 'checkOutTimestamp', null, 'shiftId', 'demo-active', 'shiftName', 'Ca test đang mở', 'lateMinutes', v_active_late, 'earlyMinutes', 0)
      ),
      'hours', 0,
      'gio', 0,
      'tongGio', 0,
      'cong', 0,
      'lateMinutes', v_active_late,
      'vaoTre', v_active_late,
      'earlyMinutes', 0,
      'raSom', 0,
      'workMode', 'online',
      'source', 'employee-online',
      'calculationMode', 'online-multiple',
      'status', 'Đang làm'
    ),
    now()
  );

  v_night_log_id := 'attendanceLogs::demo-night-' || to_char(v_yesterday, 'YYYYMMDD');
  v_night_in := ((v_yesterday + time '22:15') at time zone 'Asia/Ho_Chi_Minh');
  v_night_out := ((v_today + time '05:45') at time zone 'Asia/Ho_Chi_Minh');
  insert into public.hr_records (id, collection, data, updated_at)
  values (
    v_night_log_id,
    'attendanceLogs',
    jsonb_build_object(
      'employeeId', v_night_id,
      'employeeCode', 'LOCAL-NIGHT',
      'employeeName', v_night_name,
      'department', 'Vận hành',
      'position', 'Nhân viên vận hành',
      'shiftId', 'night',
      'shiftName', 'Ca đêm',
      'standardCheckIn', '22:00',
      'standardCheckOut', '06:00',
      'date', to_char(v_yesterday, 'YYYY-MM-DD'),
      'dayOfWeek', case extract(isodow from v_yesterday)
        when 1 then 'Thứ 2' when 2 then 'Thứ 3' when 3 then 'Thứ 4'
        when 4 then 'Thứ 5' when 5 then 'Thứ 6' when 6 then 'Thứ 7'
        else 'Chủ nhật' end,
      'checkIn', v_night_in,
      'checkOut', v_night_out,
      'vao', '22:15',
      'ra', '05:45',
      'punchPairs', jsonb_build_array(
        jsonb_build_object('checkIn', '22:15', 'checkOut', '05:45', 'checkInTimestamp', v_night_in, 'checkOutTimestamp', v_night_out, 'shiftId', 'night', 'shiftName', 'Ca đêm', 'lateMinutes', 15, 'earlyMinutes', 15)
      ),
      'hours', 7.5,
      'gio', 7.5,
      'tongGio', 7.5,
      'cong', 1,
      'lateMinutes', 15,
      'vaoTre', 15,
      'earlyMinutes', 15,
      'raSom', 15,
      'workMode', 'online',
      'source', 'employee-online',
      'calculationMode', 'online-multiple',
      'status', 'Đủ'
    ),
    now()
  );

  insert into public.hr_records (id, collection, data, updated_at)
  values (
    'attendanceCorrectionRequests::90000000-0000-0000-0000-000000000001',
    'attendanceCorrectionRequests',
    jsonb_build_object(
      'id', '90000000-0000-0000-0000-000000000001',
      'companyId', 'speego-original',
      'attendanceLogId', substring(v_night_log_id from length('attendanceLogs::') + 1),
      'date', to_char(v_yesterday, 'YYYY-MM-DD'),
      'requesterId', v_night_id,
      'requesterCode', 'LOCAL-NIGHT',
      'requesterName', v_night_name,
      'department', 'Vận hành',
      'originalCheckIn', '22:15',
      'originalCheckOut', '05:45',
      'requestedCheckIn', '22:00',
      'requestedCheckOut', null,
      'reason', 'Tài khoản seed cục bộ: kiểm tra luồng duyệt điều chỉnh ca đêm.',
      'status', 'pending',
      'createdAt', now() - interval '10 minutes'
    ),
    now()
  );
end;
$$;
