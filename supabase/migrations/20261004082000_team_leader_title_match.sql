-- Gán Leader trên hồ sơ nhân sự (mục Leader = Có) và nhận cả chức danh Trưởng / Leader.
alter table public.users add column if not exists is_team_leader boolean not null default false;

create or replace function public.my_team_leader()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me public.users%rowtype;
  v_leader public.users%rowtype;
  v_count integer;
  v_company text;
  v_leader_id uuid;
begin
  if auth.uid() is not null then
    select * into v_me from public.users where auth_user_id = auth.uid() limit 1;
  end if;
  if v_me.id is null and to_regprocedure('public.current_hr_profile_id()') is not null then
    select * into v_me from public.users where id = public.current_hr_profile_id() limit 1;
  end if;
  if v_me.id is null then
    raise exception 'Tài khoản chưa liên kết hồ sơ nhân sự.';
  end if;
  if nullif(btrim(v_me.department), '') is null then
    raise exception 'Hồ sơ của bạn chưa có Team/phòng ban. Vui lòng liên hệ HR.';
  end if;

  v_company := coalesce(nullif(to_jsonb(v_me)->>'company_id', ''), 'speego-original');

  select count(*), (array_agg(id order by id))[1] into v_count, v_leader_id
  from public.users u
  where u.id <> v_me.id
    and coalesce(u.is_team_leader, false)
    and lower(btrim(u.department)) = lower(btrim(v_me.department))
    and (nullif(btrim(v_me.branch), '') is null or lower(btrim(u.branch)) = lower(btrim(v_me.branch)))
    and coalesce(nullif(to_jsonb(u)->>'company_id', ''), 'speego-original') = v_company;

  if v_count = 0 then
    select count(*), (array_agg(id order by id))[1] into v_count, v_leader_id
    from public.users u
    where u.id <> v_me.id
      and lower(btrim(u.department)) = lower(btrim(v_me.department))
      and (nullif(btrim(v_me.branch), '') is null or lower(btrim(u.branch)) = lower(btrim(v_me.branch)))
      and coalesce(nullif(to_jsonb(u)->>'company_id', ''), 'speego-original') = v_company
      and (
        u.position ~* '(^|[^[:alpha:]])leader([^[:alpha:]]|$)'
        or u.position ~* 'trưởng'
      );
  end if;

  if v_count = 0 then
    select count(*), (array_agg(id order by id))[1] into v_count, v_leader_id
    from public.users u
    where u.id <> v_me.id
      and lower(btrim(u.department)) = lower(btrim(v_me.department))
      and (nullif(btrim(v_me.branch), '') is null or lower(btrim(u.branch)) = lower(btrim(v_me.branch)))
      and coalesce(nullif(to_jsonb(u)->>'company_id', ''), 'speego-original') = v_company
      and lower(coalesce(u.role, '')) in ('admin', 'hr', 'manager');
  end if;

  if v_count = 0 then
    raise exception 'Phòng % chưa có Leader. Hãy mở hồ sơ một người trong phòng và chọn Leader: Có.', v_me.department;
  elsif v_count > 1 then
    raise exception 'Phòng % có nhiều Leader. Chỉ để một người ở mục Leader.', v_me.department;
  end if;

  select * into v_leader from public.users where id = v_leader_id;
  return jsonb_build_object(
    'id', v_leader.id,
    'name', v_leader.name,
    'avatar', coalesce(v_leader.avatar_url, ''),
    'department', v_me.department
  );
end;
$$;

revoke all on function public.my_team_leader() from public;
grant execute on function public.my_team_leader() to anon, authenticated;
