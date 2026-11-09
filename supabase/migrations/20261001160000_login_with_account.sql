-- Đăng nhập bằng tên tài khoản (username / mã NV / email) và mật khẩu trên public.users.
create or replace function public.login_with_account(p_account text, p_password text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account text := lower(btrim(coalesce(p_account, '')));
  v_user public.users%rowtype;
begin
  if v_account = '' or p_password is null or btrim(p_password) = '' then
    return null;
  end if;

  select *
  into v_user
  from public.users
  where lower(btrim(coalesce(username, ''))) = v_account
     or lower(btrim(coalesce(employee_id, ''))) = v_account
     or lower(btrim(coalesce(email, ''))) = v_account
  order by
    case
      when lower(btrim(coalesce(username, ''))) = v_account then 0
      when lower(btrim(coalesce(employee_id, ''))) = v_account then 1
      else 2
    end
  limit 1;

  if not found then
    return null;
  end if;

  if v_user.password is not null and btrim(v_user.password) <> '' then
    if v_user.password <> p_password and btrim(v_user.password) <> btrim(p_password) then
      return null;
    end if;

    return ((to_jsonb(v_user) - 'password') || jsonb_build_object('password_matched', true))::json;
  end if;

  if v_user.email is null or btrim(v_user.email) = '' then
    return null;
  end if;

  return json_build_object(
    'password_matched', false,
    'email', v_user.email
  );
end;
$$;

revoke all on function public.login_with_account(text, text) from public;
grant execute on function public.login_with_account(text, text) to anon, authenticated, service_role;
