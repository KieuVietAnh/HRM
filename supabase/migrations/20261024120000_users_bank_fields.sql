-- Thông tin ngân hàng trên hồ sơ nhân sự (mẫu Excel import/export).
alter table public.users add column if not exists bank_name text;
alter table public.users add column if not exists bank_account_number text;
alter table public.users add column if not exists bank_account_name text;
