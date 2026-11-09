-- Cho phép xóa ngày nghỉ phép đã chọn trên trang Ngày nghỉ phép.
grant delete on table public.employee_leave_days to anon, authenticated;

drop policy if exists "employee_leave_days_delete" on public.employee_leave_days;
create policy "employee_leave_days_delete"
  on public.employee_leave_days for delete to authenticated
  using (
    company_id = public.current_leave_company_id()
    and (
      public.current_hr_role() in ('admin', 'hr')
      or employee_id = public.current_hr_profile_id()
    )
  );

drop policy if exists "employee_leave_days_delete_anon" on public.employee_leave_days;
create policy "employee_leave_days_delete_anon"
  on public.employee_leave_days for delete to anon
  using (true);
