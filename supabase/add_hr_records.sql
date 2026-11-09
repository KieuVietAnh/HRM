-- Chỉ thêm bảng hr_records nếu đã chạy schema users trước đó
-- Copy → SQL Editor → Run

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.hr_records (
  id text primary key,
  collection text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hr_records add column if not exists collection text;
alter table public.hr_records add column if not exists data jsonb;
alter table public.hr_records add column if not exists created_at timestamptz;
alter table public.hr_records add column if not exists updated_at timestamptz;

create index if not exists hr_records_collection_idx on public.hr_records (collection);
create index if not exists hr_records_collection_updated_idx on public.hr_records (collection, updated_at desc);
create index if not exists hr_records_data_gin on public.hr_records using gin (data);

drop trigger if exists hr_records_set_updated_at on public.hr_records;
create trigger hr_records_set_updated_at
  before update on public.hr_records
  for each row execute function public.set_updated_at();

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.hr_records to anon, authenticated;

alter table public.hr_records enable row level security;

drop policy if exists "hr_records_select_anon" on public.hr_records;
drop policy if exists "hr_records_insert_anon" on public.hr_records;
drop policy if exists "hr_records_update_anon" on public.hr_records;
drop policy if exists "hr_records_delete_anon" on public.hr_records;

create policy "hr_records_select_anon" on public.hr_records for select to anon, authenticated using (true);
create policy "hr_records_insert_anon" on public.hr_records for insert to anon, authenticated with check (true);
create policy "hr_records_update_anon" on public.hr_records for update to anon, authenticated using (true) with check (true);
create policy "hr_records_delete_anon" on public.hr_records for delete to anon, authenticated using (true);
