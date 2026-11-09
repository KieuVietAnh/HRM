-- Employees see their own attendance logs. Staff keep the broad access from the
-- existing hr_records policies; everyone may read the shared shift settings.
drop policy if exists "hr_records_attendance_all_authenticated" on public.hr_records;
drop policy if exists "hr_records_attendance_own_logs" on public.hr_records;
create policy "hr_records_attendance_own_logs"
  on public.hr_records for select to authenticated
  using (
    collection = 'attendanceSettings'
    or (
      collection = 'attendanceLogs'
      and data ->> 'employeeId' = public.current_hr_profile_id()::text
    )
  );

-- Return the separate penalties table to its original staff-only policies.
drop policy if exists "attendance_penalties_all_authenticated" on public.attendance_penalties;
