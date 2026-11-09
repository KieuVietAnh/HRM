-- Speed up month filters on attendanceLogs (data->>'date' like 'YYYY-MM-%').
create index if not exists hr_records_attendance_logs_date_idx
  on public.hr_records ((data->>'date'))
  where collection = 'attendanceLogs';
