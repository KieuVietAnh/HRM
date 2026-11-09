-- Admins can assign one or more configured shifts directly to an employee.
-- Ordinary employee registrations still belong to the signed-in employee and
-- still enter the pending queue.
create or replace function public.set_shift_registration_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.users%rowtype;
  v_target public.users%rowtype;
  v_actor_company text;
  v_target_company text;
  v_admin_assignment boolean;
begin
  v_actor := public.online_attendance_profile(null);
  v_admin_assignment := coalesce(current_setting('app.admin_shift_assignment', true), '') = 'on'
    and v_actor.role = 'admin';

  if v_admin_assignment then
    select * into v_target from public.users where id = new.employee_id;
  else
    v_target := v_actor;
  end if;
  if v_target.id is null or nullif(btrim(coalesce(v_target.name, '')), '') is null then
    raise exception 'Không tìm thấy hồ sơ nhân viên hợp lệ' using errcode = '42501';
  end if;

  v_actor_company := coalesce(nullif(to_jsonb(v_actor)->>'company_id', ''), 'speego-original');
  v_target_company := coalesce(nullif(to_jsonb(v_target)->>'company_id', ''), 'speego-original');
  if v_actor_company <> v_target_company then
    raise exception 'Nhân viên không thuộc công ty của bạn' using errcode = '42501';
  end if;

  new.employee_id := v_target.id;
  new.employee_name := v_target.name;
  new.company_id := v_target_company;
  new.status := case when v_admin_assignment then 'approved' else 'pending' end;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.admin_assign_employee_shifts(
  p_employee_id uuid,
  p_work_date date,
  p_shift_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.users%rowtype;
  v_target public.users%rowtype;
  v_company text;
  v_settings jsonb := '{}'::jsonb;
  v_shift_id text;
  v_config jsonb;
  v_name text;
  v_start text;
  v_end text;
  v_result jsonb;
begin
  v_actor := public.online_attendance_profile(null);
  if coalesce(v_actor.role, '') <> 'admin' then
    raise exception 'Chỉ admin được gán ca trực tiếp cho nhân viên' using errcode = '42501';
  end if;
  if p_employee_id is null or p_work_date is null or p_shift_ids is null
    or cardinality(p_shift_ids) = 0 or cardinality(p_shift_ids) > 20 then
    raise exception 'Hãy chọn nhân viên, ngày và từ 1 đến 20 ca';
  end if;
  if array_position(p_shift_ids, null) is not null
    or exists (select 1 from unnest(p_shift_ids) as selected(shift_id)
      where btrim(selected.shift_id) = '') then
    raise exception 'Danh sách ca không hợp lệ';
  end if;
  if exists (select 1 from unnest(p_shift_ids) as selected(shift_id)
    where btrim(selected.shift_id) = 'off')
    and exists (select 1 from unnest(p_shift_ids) as selected(shift_id)
      where btrim(selected.shift_id) <> 'off') then
    raise exception 'Không thể gán ngày nghỉ cùng với ca làm';
  end if;

  select * into v_target from public.users where id = p_employee_id;
  if v_target.id is null then raise exception 'Không tìm thấy nhân viên'; end if;
  v_company := coalesce(nullif(to_jsonb(v_actor)->>'company_id', ''), 'speego-original');
  if coalesce(nullif(to_jsonb(v_target)->>'company_id', ''), 'speego-original') <> v_company then
    raise exception 'Nhân viên không thuộc công ty của bạn' using errcode = '42501';
  end if;

  select coalesce(data, '{}'::jsonb) into v_settings
  from public.hr_records where id = 'attendanceSettings::default';
  v_settings := coalesce(v_settings, '{}'::jsonb);
  perform pg_advisory_xact_lock(hashtext(p_employee_id::text || ':' || p_work_date::text));
  perform set_config('app.admin_shift_assignment', 'on', true);

  for v_shift_id in select distinct btrim(shift_id) from unnest(p_shift_ids) as input(shift_id)
  loop
    if v_shift_id = 'off' then
      if exists (select 1 from public.employee_shift_registrations
        where employee_id = p_employee_id and work_date = p_work_date
          and shift_id <> 'off' and status = 'approved') then
        raise exception 'Nhân viên đã có ca làm được duyệt trong ngày này';
      end if;
      update public.employee_shift_registrations set status = 'rejected'
      where employee_id = p_employee_id and work_date = p_work_date
        and shift_id <> 'off' and status = 'pending';
      v_name := 'Nghỉ';
      v_start := null;
      v_end := null;
    else
      if exists (select 1 from public.employee_shift_registrations
        where employee_id = p_employee_id and work_date = p_work_date
          and shift_id = 'off' and status = 'approved') then
        raise exception 'Nhân viên đã được duyệt nghỉ trong ngày này';
      end if;
      update public.employee_shift_registrations set status = 'rejected'
      where employee_id = p_employee_id and work_date = p_work_date
        and shift_id = 'off' and status = 'pending';

      if jsonb_typeof(v_settings->'shifts') = 'array' then
        select shifts.value into v_config
        from jsonb_array_elements(v_settings->'shifts') as shifts(value)
        where shifts.value->>'id' = v_shift_id limit 1;
      else
        v_config := v_settings #> array['shifts', v_shift_id];
      end if;
      if v_config is null and v_shift_id not in ('administrative', 'saleMorning') then
        raise exception 'Ca % không có trong cấu hình chấm công', v_shift_id;
      end if;
      v_name := coalesce(nullif(v_config->>'name', ''),
        case when v_shift_id = 'administrative' then 'Ca Hành chính'
          when v_shift_id = 'saleMorning' then 'Ca Sáng Sale' end, v_shift_id);
      v_start := coalesce(nullif(v_config->>'standardCheckIn', ''), nullif(v_config->>'start', ''),
        case when v_shift_id = 'administrative' then nullif(v_settings->>'standardCheckIn', '') end,
        case when v_shift_id = 'administrative' then '08:30'
          when v_shift_id = 'saleMorning' then '04:00' end);
      v_end := coalesce(nullif(v_config->>'standardCheckOut', ''), nullif(v_config->>'end', ''),
        case when v_shift_id = 'administrative' then nullif(v_settings->>'standardCheckOut', '') end,
        case when v_shift_id = 'administrative' then '17:30'
          when v_shift_id = 'saleMorning' then '13:30' end);
      if v_start is null or v_end is null
        or v_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or v_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception 'Giờ ca % không hợp lệ', v_shift_id;
      end if;
    end if;

    if exists (select 1 from public.employee_shift_registrations
      where employee_id = p_employee_id and work_date = p_work_date
        and shift_id = v_shift_id and status = 'approved') then
      continue;
    end if;
    delete from public.employee_shift_registrations
    where employee_id = p_employee_id and work_date = p_work_date
      and shift_id = v_shift_id and status <> 'approved';
    insert into public.employee_shift_registrations
      (company_id, employee_id, employee_name, work_date, shift_id, shift_name, start_time, end_time, status)
    values (v_company, p_employee_id, v_target.name, p_work_date,
      v_shift_id, v_name, v_start, v_end, 'approved');
  end loop;

  perform set_config('app.admin_shift_assignment', '', true);
  select coalesce(jsonb_agg(to_jsonb(registration) order by registration.start_time), '[]'::jsonb)
    into v_result
  from public.employee_shift_registrations registration
  where registration.employee_id = p_employee_id
    and registration.work_date = p_work_date
    and registration.shift_id = any(p_shift_ids)
    and registration.status = 'approved';
  return v_result;
end;
$$;

revoke all on function public.admin_assign_employee_shifts(uuid, date, text[]) from public;
grant execute on function public.admin_assign_employee_shifts(uuid, date, text[]) to anon, authenticated;
