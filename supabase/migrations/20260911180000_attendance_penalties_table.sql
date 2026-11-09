-- Bảng phạt nhập tay (riêng, không dùng hr_records)
-- Chạy: Supabase → SQL Editor → Paste → Run

create table if not exists public.attendance_penalties (
  id uuid primary key default gen_random_uuid(),
  month text not null,
  penalty_date date,
  employee_id uuid references public.users (id) on delete set null,
  employee_code text not null default '',
  employee_name text not null default '',
  category text not null default '',
  content text not null default '',
  amount numeric(14, 0) not null default 0,
  note text not null default '',
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_penalties_month_format
    check (month ~ '^\d{4}-\d{2}$'),
  constraint attendance_penalties_source_check
    check (source in ('manual', 'auto'))
);

create index if not exists attendance_penalties_month_idx
  on public.attendance_penalties (month);

create index if not exists attendance_penalties_date_idx
  on public.attendance_penalties (penalty_date);

create index if not exists attendance_penalties_employee_idx
  on public.attendance_penalties (employee_id);

create or replace function public.set_attendance_penalties_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  if new.penalty_date is not null then
    new.month = to_char(new.penalty_date, 'YYYY-MM');
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_penalties_set_updated_at on public.attendance_penalties;
create trigger attendance_penalties_set_updated_at
before insert or update on public.attendance_penalties
for each row
execute function public.set_attendance_penalties_updated_at();

alter table public.attendance_penalties enable row level security;

drop policy if exists "attendance_penalties_select_staff" on public.attendance_penalties;
drop policy if exists "attendance_penalties_insert_staff" on public.attendance_penalties;
drop policy if exists "attendance_penalties_update_staff" on public.attendance_penalties;
drop policy if exists "attendance_penalties_delete_staff" on public.attendance_penalties;

revoke all on table public.attendance_penalties from anon;
grant select, insert, update, delete on table public.attendance_penalties to authenticated;

create policy "attendance_penalties_select_staff"
  on public.attendance_penalties for select to authenticated
  using (public.current_hr_role() in ('admin', 'hr', 'manager'));

create policy "attendance_penalties_insert_staff"
  on public.attendance_penalties for insert to authenticated
  with check (public.current_hr_role() in ('admin', 'hr', 'manager'));

create policy "attendance_penalties_update_staff"
  on public.attendance_penalties for update to authenticated
  using (public.current_hr_role() in ('admin', 'hr', 'manager'))
  with check (public.current_hr_role() in ('admin', 'hr', 'manager'));

create policy "attendance_penalties_delete_staff"
  on public.attendance_penalties for delete to authenticated
  using (public.current_hr_role() in ('admin', 'hr', 'manager'));
