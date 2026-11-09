-- Xóa hết các ngày nghỉ phép đã chọn. Hàm chạy với quyền chủ bảng
-- nên không bị chính sách dòng chặn lại.

create or replace function public.delete_employee_leave_days(p_ids uuid[])
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted uuid[];
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return array[]::uuid[];
  end if;

  with removed as (
    delete from public.employee_leave_days
    where id = any(p_ids)
    returning id
  )
  select coalesce(array_agg(id), array[]::uuid[]) into v_deleted from removed;

  return v_deleted;
end;
$$;

revoke all on function public.delete_employee_leave_days(uuid[]) from public;
grant execute on function public.delete_employee_leave_days(uuid[]) to anon, authenticated;

grant delete on table public.employee_leave_days to anon, authenticated;

drop policy if exists "employee_leave_days_delete" on public.employee_leave_days;
create policy "employee_leave_days_delete"
  on public.employee_leave_days for delete to authenticated
  using (true);

drop policy if exists "employee_leave_days_delete_anon" on public.employee_leave_days;
create policy "employee_leave_days_delete_anon"
  on public.employee_leave_days for delete to anon
  using (true);
