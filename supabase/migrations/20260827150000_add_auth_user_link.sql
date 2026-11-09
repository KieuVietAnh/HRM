-- Link each HR employee profile to one Supabase Auth identity.
alter table public.users
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists users_auth_user_id_unique
  on public.users (auth_user_id)
  where auth_user_id is not null;

comment on column public.users.auth_user_id is
  'Supabase Auth identity that owns this employee profile.';
