-- Excel-imported daily/shift records have one stable business identity.
-- Legacy/manual/online records are intentionally outside this constraint.
create unique index if not exists hr_records_excel_attendance_identity_uidx
  on public.hr_records (
    (data->>'employeeId'),
    (data->>'date'),
    (coalesce(
      nullif(data->>'shiftName', ''),
      nullif(data->>'tenCa', ''),
      nullif(data->>'importEventKey', ''),
      'day'
    ))
  )
  where collection = 'attendanceLogs'
    and data->>'sourceType' = 'excel-import';

comment on index public.hr_records_excel_attendance_identity_uidx is
  'Prevents duplicate Excel attendance rows for the same employee, work date and stable shift/event.';
