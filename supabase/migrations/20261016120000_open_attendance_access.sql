-- Attendance data is available to every authenticated account, regardless of role.
-- Keep the existing staff policies in place for all other hr_records collections.
create policy "hr_records_attendance_all_authenticated"
  on public.hr_records for all to authenticated
  using (collection = any (array[
    'attendanceLogs',
    'attendanceMonthSummaries',
    'attendanceAdjustments',
    'attendanceMonthConfirmations',
    'attendanceSettings',
    'attendanceNotes',
    'attendanceEmployeeMappings',
    'attendanceImportMappingTemplates',
    'attendanceImportJobs',
    'attendanceMonthPenalties',
    'manualWorkdays'
  ]::text[]))
  with check (collection = any (array[
    'attendanceLogs',
    'attendanceMonthSummaries',
    'attendanceAdjustments',
    'attendanceMonthConfirmations',
    'attendanceSettings',
    'attendanceNotes',
    'attendanceEmployeeMappings',
    'attendanceImportMappingTemplates',
    'attendanceImportJobs',
    'attendanceMonthPenalties',
    'manualWorkdays'
  ]::text[]));

-- The separate penalties table follows the same attendance access rule.
drop policy if exists "attendance_penalties_all_authenticated" on public.attendance_penalties;
create policy "attendance_penalties_all_authenticated"
  on public.attendance_penalties for all to authenticated
  using (true)
  with check (true);
