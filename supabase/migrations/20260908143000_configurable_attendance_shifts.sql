-- Resolve attendance thresholds from the configured shift selected for each
-- employee. The legacy top-level times remain the administrative fallback.

create or replace function public.attendance_shift_for_profile(
  p_profile public.users,
  p_settings jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_identity text := lower(concat_ws(' ',
    coalesce(p_profile.department, ''),
    coalesce(p_profile.position, ''),
    coalesce(p_profile.shift, '')
  ));
  v_match text[];
  v_shift_config jsonb;
  v_shift_name text;
  v_standard_in text;
  v_standard_out text;
  v_is_sale boolean;
begin
  v_match := regexp_match(
    coalesce(p_profile.shift, ''),
    '([0-2]?[0-9]:[0-5][0-9])[^0-9]+([0-2]?[0-9]:[0-5][0-9])'
  );

  if v_match is not null and array_length(v_match, 1) >= 2 then
    return jsonb_build_object(
      'name', coalesce(nullif(p_profile.shift, ''), 'Ca nhân viên'),
      'standardCheckIn', to_char(v_match[1]::time, 'HH24:MI'),
      'standardCheckOut', to_char(v_match[2]::time, 'HH24:MI')
    );
  end if;

  v_is_sale := lower(trim(coalesce(p_profile.department, ''))) = 'trang'
    or v_identity ~ '(^|[^a-z])(sale|sales)([^a-z]|$)'
    or v_identity like '%kinh doanh%';

  if v_is_sale then
    v_shift_config := coalesce(
      p_settings #> '{shifts,saleMorning}',
      '{}'::jsonb
    );
    v_shift_name := coalesce(
      nullif(v_shift_config ->> 'name', ''),
      'Ca Sáng Sale'
    );
    v_standard_in := coalesce(
      nullif(v_shift_config ->> 'standardCheckIn', ''),
      nullif(v_shift_config ->> 'start', ''),
      '04:00'
    );
    v_standard_out := coalesce(
      nullif(v_shift_config ->> 'standardCheckOut', ''),
      nullif(v_shift_config ->> 'end', ''),
      '13:30'
    );
  else
    v_shift_config := coalesce(
      p_settings #> '{shifts,administrative}',
      '{}'::jsonb
    );
    v_shift_name := coalesce(
      nullif(v_shift_config ->> 'name', ''),
      'Ca Hành chính'
    );
    v_standard_in := coalesce(
      nullif(v_shift_config ->> 'standardCheckIn', ''),
      nullif(v_shift_config ->> 'start', ''),
      nullif(p_settings ->> 'standardCheckIn', ''),
      '08:30'
    );
    v_standard_out := coalesce(
      nullif(v_shift_config ->> 'standardCheckOut', ''),
      nullif(v_shift_config ->> 'end', ''),
      nullif(p_settings ->> 'standardCheckOut', ''),
      '17:30'
    );
  end if;

  return jsonb_build_object(
    'name', v_shift_name,
    'standardCheckIn', to_char(v_standard_in::time, 'HH24:MI'),
    'standardCheckOut', to_char(v_standard_out::time, 'HH24:MI')
  );
end;
$$;

revoke all on function public.attendance_shift_for_profile(public.users, jsonb) from public, anon;
grant execute on function public.attendance_shift_for_profile(public.users, jsonb) to authenticated;
