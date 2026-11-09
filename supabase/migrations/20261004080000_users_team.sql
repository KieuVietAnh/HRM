-- Team trên hồ sơ nhân sự, tách khỏi Bộ phận (department).
alter table public.users add column if not exists team text;
