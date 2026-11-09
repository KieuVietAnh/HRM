-- Keep existing leave records approved; newly submitted leave requests wait for HR.
alter table public.employee_leave_days
  add column if not exists status text;

update public.employee_leave_days
set status = 'approved'
where status is null;

alter table public.employee_leave_days
  alter column status set default 'pending',
  alter column status set not null;

alter table public.employee_leave_days
  drop constraint if exists employee_leave_days_status_check;

alter table public.employee_leave_days
  add constraint employee_leave_days_status_check
  check (status in ('pending', 'approved'));

-- HR can only change the status field, and only for requests in their company.
grant update (status) on table public.employee_leave_days to authenticated;

drop policy if exists "employee_leave_days_approve_hr" on public.employee_leave_days;
create policy "employee_leave_days_approve_hr"
  on public.employee_leave_days for update to authenticated
  using (
    company_id = public.current_leave_company_id()
    and public.current_hr_role() in ('admin', 'hr')
    and status = 'pending'
  )
  with check (
    company_id = public.current_leave_company_id()
    and public.current_hr_role() in ('admin', 'hr')
    and status = 'approved'
  );
