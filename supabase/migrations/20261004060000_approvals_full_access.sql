-- Trang Đề xuất cần đọc danh sách nhân sự và gọi các hàm duyệt.
-- Đăng nhập tài khoản dùng role anon, trong khi users và các hàm đề xuất
-- chỉ còn quyền authenticated.

grant select, insert, update, delete on table public.users to anon, authenticated;

drop policy if exists "users_select_anon" on public.users;
drop policy if exists "users_insert_anon" on public.users;
drop policy if exists "users_update_anon" on public.users;
drop policy if exists "users_delete_anon" on public.users;
drop policy if exists "users_select_all_authenticated" on public.users;

create policy "users_select_anon"
  on public.users for select to anon
  using (true);

create policy "users_insert_anon"
  on public.users for insert to anon
  with check (true);

create policy "users_update_anon"
  on public.users for update to anon
  using (true)
  with check (true);

create policy "users_delete_anon"
  on public.users for delete to anon
  using (true);

create policy "users_select_all_authenticated"
  on public.users for select to authenticated
  using (true);

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
  v_header uuid;
begin
  if auth.uid() is not null then
    select coalesce(role, 'user') into v_role
    from public.users
    where auth_user_id = auth.uid()
    limit 1;
    return v_role;
  end if;

  begin
    v_header := nullif(current_setting('request.headers', true)::json->>'x-employee-id', '')::uuid;
  exception when others then
    v_header := null;
  end;
  if v_header is null then
    return null;
  end if;

  select coalesce(role, 'user') into v_role
  from public.users
  where id = v_header
  limit 1;
  return v_role;
end;
$$;

revoke all on function public.current_hr_profile_id() from public;
revoke all on function public.current_hr_role() from public;
grant execute on function public.current_hr_profile_id() to anon, authenticated;
grant execute on function public.current_hr_role() to anon, authenticated;

do $$
begin
  if to_regprocedure('public.my_team_leader()') is not null then
    grant execute on function public.my_team_leader() to anon, authenticated;
  end if;
  if to_regprocedure('public.my_approval_leave_balance(integer)') is not null then
    grant execute on function public.my_approval_leave_balance(integer) to anon, authenticated;
  end if;
  if to_regprocedure('public.my_approval_leave_month_usage(integer, integer)') is not null then
    grant execute on function public.my_approval_leave_month_usage(integer, integer) to anon, authenticated;
  end if;
  if to_regprocedure('public.submit_employee_approval(jsonb)') is not null then
    grant execute on function public.submit_employee_approval(jsonb) to anon, authenticated;
  end if;
  if to_regprocedure('public.decide_employee_approval(text, text, text)') is not null then
    grant execute on function public.decide_employee_approval(text, text, text) to anon, authenticated;
  end if;
end $$;
