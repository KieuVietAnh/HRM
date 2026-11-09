-- my_team_leader chỉ tìm hồ sơ qua auth.uid(). Đăng nhập tài khoản không có
-- phiên Supabase Auth nên RPC trả 400. Dùng hồ sơ từ header x-employee-id.

create or replace function public.current_hr_profile_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_header uuid;
begin
  if auth.uid() is not null then
    select id into v_id from public.users where auth_user_id = auth.uid() limit 1;
    return v_id;
  end if;

  begin
    v_header := nullif(current_setting('request.headers', true)::json->>'x-employee-id', '')::uuid;
  exception when others then
    v_header := null;
  end;
  return v_header;
end;
$$;

create or replace function public.current_hr_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select coalesce(role, 'user') into v_role
  from public.users
  where id = public.current_hr_profile_id()
  limit 1;
  return v_role;
end;
$$;

create or replace function public.current_leave_company_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(to_jsonb(u)->>'company_id', ''), 'speego-original')
  from public.users u
  where u.id = public.current_hr_profile_id()
  limit 1
$$;

revoke all on function public.current_hr_profile_id() from public;
revoke all on function public.current_hr_role() from public;
revoke all on function public.current_leave_company_id() from public;
grant execute on function public.current_hr_profile_id() to anon, authenticated;
grant execute on function public.current_hr_role() to anon, authenticated;
grant execute on function public.current_leave_company_id() to anon, authenticated;

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
  select * into v_me from public.users where id = public.current_hr_profile_id();
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
    and lower(btrim(u.department)) = lower(btrim(v_me.department))
    and (nullif(btrim(v_me.branch), '') is null or lower(btrim(u.branch)) = lower(btrim(v_me.branch)))
    and coalesce(nullif(to_jsonb(u)->>'company_id', ''), 'speego-original') = v_company
    and u.position ~* '(^|[^[:alpha:]])leader([^[:alpha:]]|$)';

  if v_count = 0 then
    raise exception 'Team % chưa có Leader. Vui lòng liên hệ HR.', v_me.department;
  elsif v_count > 1 then
    raise exception 'Team % có nhiều Leader. Vui lòng liên hệ HR xác định một người duyệt.', v_me.department;
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
