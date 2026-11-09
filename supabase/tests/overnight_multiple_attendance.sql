-- Run with psql -v ON_ERROR_STOP=1 -f this-file in an EMPTY disposable database.
-- Stubs isolate the attendance RPCs; all fixtures and clock overrides roll back.
begin;
create table public.users (
  id uuid primary key, employee_id text, username text, name text, department text, position text
);
create table public.hr_records (id text primary key, collection text, data jsonb, updated_at timestamptz);
create table public.employee_shift_registrations (
  employee_id uuid, work_date date, shift_id text, shift_name text,
  start_time text, end_time text, status text
);
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
insert into public.users values ('00000000-0000-0000-0000-000000000001', 'night', 'night', 'Night', '', '');
create function public.online_attendance_profile(uuid) returns public.users language sql as
  $$ select * from public.users limit 1 $$;
create function public.attendance_shift_for_profile(public.users, jsonb) returns jsonb language sql as
  $$ select $2 -> 'testShift' $$;
insert into public.hr_records values ('attendanceSettings::default', 'attendanceSettings',
  '{"testShift":{"name":"Night","standardCheckIn":"20:00","standardCheckOut":"04:30"}}', now());

\ir ../migrations/20261106100000_overnight_multiple_attendance.sql

create function public.attendance_test_now() returns timestamptz language sql as
  $$ select current_setting('attendance.test_now')::timestamptz $$;
do $$ declare signature text; begin
  foreach signature in array array[
    'public.get_online_attendance_today()',
    'public.employee_online_attendance_punch(date,text,text,text,jsonb)'
  ] loop
    execute replace(pg_get_functiondef(signature::regprocedure), 'clock_timestamp()', 'public.attendance_test_now()');
  end loop;
end $$;

do $$
declare result jsonb; shifts jsonb; rejected boolean;
begin
  perform set_config('attendance.test_now', '2026-10-31 20:00+07', true);
  perform public.employee_online_attendance_punch('2026-10-31', '__profile__', 'in');
  perform set_config('attendance.test_now', '2026-10-31 21:00+07', true);
  perform public.employee_online_attendance_punch('2026-10-31', '__profile__', 'out');
  perform set_config('attendance.test_now', '2026-10-31 23:00+07', true);
  perform public.employee_online_attendance_punch('2026-10-31', '__profile__', 'in');
  perform set_config('attendance.test_now', '2026-11-01 01:00+07', true);
  perform public.employee_online_attendance_punch('2026-10-31', '__profile__', 'out');
  shifts := public.get_online_attendance_today() -> 'shifts';
  assert jsonb_array_length(shifts) = 2, 'Previous night and current profile shifts must both be available';
  perform set_config('attendance.test_now', '2026-11-01 01:30+07', true);
  result := public.employee_online_attendance_punch('2026-10-31', '__profile__', 'in');
  assert result -> 'record' ->> 'vao' = '20:00', 'Repeated check-in must preserve the first check-in';
  assert (result -> 'record' ->> 'checkIn')::timestamptz = '2026-10-31 20:00+07'::timestamptz;
  perform set_config('attendance.test_now', '2026-11-01 04:45+07', true);
  shifts := public.get_online_attendance_today() -> 'shifts';
  assert shifts -> 0 ->> 'workDate' = '2026-10-31', 'Open profile night shift must survive its scheduled end';
  result := public.employee_online_attendance_punch('2026-10-31', '__profile__', 'out');
  assert result ->> 'date' = '2026-10-31', 'Checkout must stay on the original work date at month boundary';
  assert jsonb_array_length(result -> 'record' -> 'punchPairs') = 3;
  assert (result -> 'record' ->> 'hours')::numeric = 6.25, 'Sum complete pairs without the gaps';
  assert (result -> 'record' ->> 'lateMinutes')::integer = 0;
  assert (result -> 'record' ->> 'earlyMinutes')::integer = 0;
  assert jsonb_array_length(public.get_online_attendance_today() -> 'shifts') = 1, 'Completed night shift must disappear after its end';

  rejected := false;
  begin perform public.employee_online_attendance_punch('2026-11-01', '__profile__', null);
  exception when raise_exception then rejected := true; end;
  assert rejected, 'Reject null actions';
  rejected := false;
  begin perform public.employee_online_attendance_punch(null, '__profile__', 'in');
  exception when raise_exception then rejected := true; end;
  assert rejected, 'Reject missing work date';
  rejected := false;
  begin perform public.employee_online_attendance_punch('2026-10-31', '__profile__', 'in');
  exception when raise_exception then rejected := true; end;
  assert rejected, 'Do not reopen yesterday after the scheduled end';

  -- A registration today must not hide an open profile shift from yesterday.
  update public.hr_records set data = jsonb_set(data, '{punchPairs,2,checkOut}', '""')
    where collection = 'attendanceLogs';
  insert into public.employee_shift_registrations values
    ('00000000-0000-0000-0000-000000000001', '2026-11-01', 'day', 'Day', '08:30', '17:30', 'approved');
  shifts := public.get_online_attendance_today() -> 'shifts';
  assert jsonb_array_length(shifts) = 2, 'Keep yesterday profile shift beside today registered shift';
  assert shifts -> 1 ->> 'workDate' = '2026-10-31';
  rejected := false;
  begin perform public.employee_online_attendance_punch('2026-11-01', 'day', 'in');
  exception when raise_exception then rejected := true; end;
  assert rejected, 'Cannot open a new shift while yesterday still has an open pair';

  -- Registered night shifts keep the same behavior for repeated punches.
  delete from public.hr_records where collection = 'attendanceLogs';
  insert into public.employee_shift_registrations values
    ('00000000-0000-0000-0000-000000000001', '2026-10-31', 'night', 'Night', '20:00', '04:30', 'approved');
  perform set_config('attendance.test_now', '2026-10-31 22:00+07', true);
  perform public.employee_online_attendance_punch('2026-10-31', 'night', 'in');
  perform set_config('attendance.test_now', '2026-11-01 02:00+07', true);
  result := public.employee_online_attendance_punch('2026-10-31', 'night', 'out');
  assert (result -> 'record' ->> 'earlyMinutes')::integer = 150;
  perform public.employee_online_attendance_punch('2026-10-31', 'night', 'in');
  perform set_config('attendance.test_now', '2026-11-01 05:00+07', true);
  assert jsonb_array_length(public.get_online_attendance_today() -> 'shifts') = 2;
  result := public.employee_online_attendance_punch('2026-10-31', 'night', 'out');
  assert (result -> 'record' ->> 'hours')::numeric = 7;
  assert (result -> 'record' ->> 'earlyMinutes')::integer = 0;

  -- Even a day shift may finish after midnight; it still needs an open pair.
  delete from public.hr_records where collection = 'attendanceLogs';
  update public.employee_shift_registrations set start_time = '14:00', end_time = '23:00'
    where work_date = '2026-10-31';
  perform set_config('attendance.test_now', '2026-10-31 22:00+07', true);
  perform public.employee_online_attendance_punch('2026-10-31', 'night', 'in');
  perform set_config('attendance.test_now', '2026-11-01 00:30+07', true);
  assert jsonb_array_length(public.get_online_attendance_today() -> 'shifts') = 2;
  result := public.employee_online_attendance_punch('2026-10-31', 'night', 'out');
  assert (result -> 'record' ->> 'hours')::numeric = 2.5;
  rejected := false;
  begin perform public.employee_online_attendance_punch('2026-10-31', 'night', 'out');
  exception when raise_exception then rejected := true; end;
  assert rejected, 'Cannot check out twice';
end $$;
rollback;
