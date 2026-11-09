-- Địa chỉ tạm trú trên hồ sơ nhân sự (mẫu Excel import/export).
alter table public.users add column if not exists temporary_address text;
