-- Bổ sung lý do; các ngày nghỉ đã lưu được giữ nguyên và hiển thị dấu gạch
-- ngang khi chưa có lý do. Chỉ bản ghi mới bắt buộc nhập lý do.
alter table public.employee_leave_days
  add column if not exists reason text not null default '';

create or replace function public.validate_employee_leave_day_reason()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.reason := btrim(coalesce(new.reason, ''));
  if new.reason = '' then
    raise exception 'Vui lòng nhập lý do nghỉ phép' using errcode = '23514';
  end if;
  if char_length(new.reason) > 500 then
    raise exception 'Lý do nghỉ phép không được quá 500 ký tự' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_employee_leave_day_reason() from public, anon;
grant execute on function public.validate_employee_leave_day_reason() to authenticated;

drop trigger if exists employee_leave_days_validate_reason on public.employee_leave_days;
create trigger employee_leave_days_validate_reason
  before insert on public.employee_leave_days
  for each row execute function public.validate_employee_leave_day_reason();
