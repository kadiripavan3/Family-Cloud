-- Local mode only: the people who signed in with the test code.
-- With real sign-in, the sign-in service keeps this list.
create table local_users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  created_at  timestamptz not null default now()
);
