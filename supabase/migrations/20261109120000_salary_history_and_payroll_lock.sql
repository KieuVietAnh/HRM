begin;

alter table public.users add column if not exists salary_effective_date date;
-- Ngày yêu cầu chỉ tồn tại trong câu ghi; trigger tiêu thụ và đặt lại NULL.
alter table public.users add column if not exists salary_change_effective_date date;
alter table public.users add column if not exists probation_salary_percent numeric not null default 100
  check (probation_salary_percent between 0 and 100);

-- Mức hiện có chỉ là dữ liệu chuyển đổi, HR phải đối chiếu trước khi chốt kỳ cũ.
insert into public.hr_records (id, collection, data)
select 'employeeSalaryHistory::' || id, 'employeeSalaryHistory', jsonb_build_object(
  'employeeId', id, 'entries', jsonb_build_array(jsonb_build_object(
    'effectiveDate', '0001-01-01', 'amount', total_salary,
    'probationPercent', probation_salary_percent, 'legacy', true
  )))
from public.users where nullif(btrim(total_salary), '') is not null
on conflict (id) do nothing;

create or replace function public.record_employee_salary_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_date date;
  v_text text;
  v_entries jsonb;
  v_latest jsonb;
begin
  if tg_op = 'UPDATE' then
    if new.total_salary is not distinct from old.total_salary
      and new.probation_salary_percent is not distinct from old.probation_salary_percent
      and new.salary_change_effective_date is null then
      new.salary_effective_date := old.salary_effective_date;
      return new;
    end if;
  elsif nullif(btrim(new.total_salary), '') is null then
    return new;
  end if;

  v_text := btrim(regexp_replace(btrim(coalesce(new.total_salary, '')), '\s*(₫|đ|vnd)$', '', 'i'));
  if v_text !~ '^(\d+|\d{1,3}([.,\s]\d{3})+)$' then
    raise exception 'Mức lương phải là số VNĐ nguyên không âm; nhập 0 nếu không hưởng lương.';
  end if;
  if new.probation_salary_percent is null or new.probation_salary_percent not between 0 and 100 then
    raise exception 'Tỷ lệ lương thử việc phải từ 0 đến 100.';
  end if;
  new.total_salary := regexp_replace(v_text, '[.,\s]', '', 'g');
  if new.total_salary::numeric > 9007199254740991 then
    raise exception 'Mức lương vượt giới hạn tính toán.';
  end if;

  -- Import cũ không gửi ngày hiệu lực: chỉ áp dụng thay đổi từ hôm nay.
  v_date := coalesce(new.salary_change_effective_date, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
  if v_date < date '1900-01-01' then raise exception 'Ngày hiệu lực lương không hợp lệ.'; end if;

  -- Cùng khóa với thao tác chốt để đổi lương và chốt đồng thời không bỏ sót nhau.
  perform pg_advisory_xact_lock(20261109, 1);
  if exists (select 1 from public.hr_records where collection = 'payrollMonthSnapshots'
    and data->>'month' >= to_char(v_date, 'YYYY-MM')) then
    raise exception 'Ngày hiệu lực thuộc hoặc trước kỳ lương đã chốt. Hãy chọn ngày sau kỳ đã chốt.';
  end if;

  select data->'entries' into v_entries from public.hr_records
    where id = 'employeeSalaryHistory::' || new.id for update;
  v_entries := coalesce(v_entries, '[]'::jsonb);
  if tg_op = 'UPDATE' and jsonb_array_length(v_entries) = 0 and nullif(btrim(old.total_salary), '') is not null then
    v_entries := jsonb_build_array(jsonb_build_object('effectiveDate', '0001-01-01',
      'amount', old.total_salary, 'probationPercent', old.probation_salary_percent, 'legacy', true));
  end if;
  select coalesce(jsonb_agg(entry), '[]'::jsonb) into v_entries
    from jsonb_array_elements(v_entries) entry where entry->>'effectiveDate' <> v_date::text;
  v_entries := v_entries || jsonb_build_array(jsonb_build_object(
    'effectiveDate', v_date::text, 'amount', new.total_salary,
    'probationPercent', new.probation_salary_percent, 'recordedAt', now()));
  insert into public.hr_records (id, collection, data)
    values ('employeeSalaryHistory::' || new.id, 'employeeSalaryHistory',
      jsonb_build_object('employeeId', new.id, 'entries', v_entries))
    on conflict (id) do update set data = excluded.data;
  -- Nhập bổ sung mốc cũ không làm lương trên hồ sơ lùi về mức cũ.
  select entry into v_latest from jsonb_array_elements(v_entries) entry
    order by entry->>'effectiveDate' desc limit 1;
  new.total_salary := v_latest->>'amount';
  new.probation_salary_percent := (v_latest->>'probationPercent')::numeric;
  new.salary_effective_date := (v_latest->>'effectiveDate')::date;
  new.salary_change_effective_date := null;
  return new;
end;
$$;

create trigger users_record_salary_change before insert or update on public.users
  for each row execute function public.record_employee_salary_change();

create or replace function public.protect_payroll_history()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op <> 'INSERT' and old.collection = 'payrollMonthSnapshots' then
    raise exception 'Bảng lương đã chốt không được sửa hoặc xóa.';
  end if;
  if (tg_op <> 'INSERT' and old.collection = 'employeeSalaryHistory')
    or (tg_op <> 'DELETE' and new.collection = 'employeeSalaryHistory') then
    if pg_trigger_depth() < 2 then
      raise exception 'Lịch sử lương chỉ được cập nhật qua hồ sơ nhân sự.';
    end if;
  end if;
  if tg_op <> 'DELETE' and new.collection = 'payrollMonthSnapshots' then
    perform pg_advisory_xact_lock(20261109, 1);
    if new.data->>'month' !~ '^\d{4}-(0[1-9]|1[0-2])$'
      or new.data->>'month' is null
      or new.id <> 'payrollMonthSnapshots::' || (new.data->>'month')
      or jsonb_typeof(new.data->'rows') is distinct from 'array'
      or jsonb_typeof(new.data->'standardWorkdays') is distinct from 'number'
      or new.data->>'lockedAt' is null then
      raise exception 'Dữ liệu chốt bảng lương không hợp lệ.';
    end if;
    if (new.data->>'standardWorkdays')::numeric not between 0.5 and 31 then
      raise exception 'Công chuẩn phải từ 0,5 đến 31.';
    end if;
    if jsonb_array_length(new.data->'rows') = 0 or exists (
      select 1 from jsonb_array_elements(new.data->'rows') r
      where jsonb_typeof(r->'payroll'->'amount') is distinct from 'number'
        or coalesce(r->'payroll'->>'error', '') <> ''
    ) then raise exception 'Không thể chốt bảng lương thiếu mức lương hoặc công theo ngày.'; end if;
    if exists (select 1 from jsonb_array_elements(new.data->'rows') r
      where (r->'payroll'->>'amount')::numeric not between 0 and 9007199254740991
        or (r->'payroll'->>'amount')::numeric <> trunc((r->'payroll'->>'amount')::numeric)
    ) then raise exception 'Tiền lương không hợp lệ.'; end if;
    if new.data->>'legacyVerified' is distinct from 'true' and exists (
      select 1 from jsonb_array_elements(new.data->'rows') r where r->'payroll'->>'legacy' = 'true'
    ) then raise exception 'Cần xác nhận đã đối chiếu mức lương cũ.'; end if;
    -- Từ chối bản tính dựa trên lịch sử cũ nếu có thay đổi trong lúc HR đang xem.
    if new.data->'salaryHistory' is distinct from coalesce((
      select jsonb_object_agg(data->>'employeeId', data->'entries')
      from public.hr_records where collection = 'employeeSalaryHistory'
    ), '{}'::jsonb) then
      raise exception 'Lịch sử lương vừa thay đổi. Hãy tải lại bảng lương rồi chốt.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger hr_records_protect_payroll_history before insert or update or delete on public.hr_records
  for each row execute function public.protect_payroll_history();

commit;
