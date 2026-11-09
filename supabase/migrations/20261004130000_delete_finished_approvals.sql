-- Xóa các đề xuất đã hoàn thành được chọn trên trang Đề xuất.
create or replace function public.delete_approval_requests(p_ids text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted text[];
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return array[]::text[];
  end if;

  with removed as (
    delete from public.hr_records
    where collection = 'approvalRequests'
      and id = any(array(select 'approvalRequests::' || item from unnest(p_ids) as item))
    returning id
  )
  select coalesce(array_agg(substring(id from length('approvalRequests::') + 1)), array[]::text[])
    into v_deleted
  from removed;

  return v_deleted;
end;
$$;

revoke all on function public.delete_approval_requests(text[]) from public;
grant execute on function public.delete_approval_requests(text[]) to anon, authenticated;
