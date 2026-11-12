-- The spine: people, circles, and the one rule about who can see a thing.

-- A person. id is the id of the signed-in user (from the sign-in service, shared with Journey).
create table profiles (
  id            uuid primary key,
  display_name  text not null check (char_length(display_name) between 1 and 50),
  age_confirmed_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table settings (
  user_id          uuid primary key references profiles(id) on delete cascade,
  notify_activity  boolean not null default true,
  weekly_summary   boolean not null default true,
  summary_email    boolean not null default false,
  updated_at       timestamptz not null default now()
);

-- A file someone uploaded: a photo (kept in three sizes next to the original), a video, a document or a sound.
create table media (
  id            uuid primary key,
  owner_id      uuid not null references profiles(id) on delete cascade,
  kind          text not null check (kind in ('photo', 'video', 'file', 'audio')),
  status        text not null default 'pending' check (status in ('pending', 'working', 'ready', 'failed')),
  content_type  text not null,
  file_name     text,
  storage_key   text not null,
  has_sizes     boolean not null default false,
  bytes         bigint,
  width         integer,
  height        integer,
  duration_s    integer,
  created_at    timestamptz not null default now()
);
create index media_owner on media (owner_id, created_at desc);

alter table profiles add column avatar_media_id uuid references media(id) on delete set null;
create index profiles_avatar on profiles (avatar_media_id) where avatar_media_id is not null;

-- Files whose record is gone, waiting to be removed from storage. Tried again until they are.
create table removed_files (
  id           bigint generated always as identity primary key,
  storage_key  text not null,
  has_sizes    boolean not null default false,
  queued_at    timestamptz not null default now(),
  attempts     integer not null default 0,
  next_try_at  timestamptz not null default now()
);
create index removed_files_due on removed_files (next_try_at);

-- When a media record goes, its file is queued for removal in the same transaction.
create function queue_removed_file() returns trigger language plpgsql as $$
begin
  insert into removed_files (storage_key, has_sizes) values (old.storage_key, old.has_sizes);
  return old;
end $$;
create trigger media_removed after delete on media for each row execute function queue_removed_file();

create table job_runs (
  job          text not null,
  period       text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  primary key (job, period)
);

create table rate_limits (
  id          text primary key,
  state       bytea,
  expires_at  bigint
);
create index rate_limits_expiry on rate_limits (expires_at);

create table devices (
  token       text primary key,
  user_id     uuid not null references profiles(id) on delete cascade,
  platform    text not null check (platform in ('ios', 'android', 'web')),
  time_zone   text not null default 'UTC',
  created_at  timestamptz not null default now(),
  seen_at     timestamptz not null default now()
);
create index devices_user on devices (user_id, seen_at desc);

create table emails (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  subject        text not null,
  html           text not null,
  body           text not null,
  send_once_key  text not null unique,
  status         text not null default 'pending' check (status in ('pending', 'sent', 'refused', 'gave_up')),
  attempts       integer not null default 0,
  next_try_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  done_at        timestamptz
);
create index emails_due on emails (next_try_at) where status = 'pending';
create index emails_done on emails (done_at) where status <> 'pending';
create index emails_user on emails (user_id);

create table deleted_accounts (
  id                  uuid primary key,
  deleted_at          timestamptz not null default now(),
  sign_in_removed_at  timestamptz,
  attempts            integer not null default 0,
  next_try_at         timestamptz not null default now()
);
create index deleted_accounts_waiting on deleted_accounts (next_try_at) where sign_in_removed_at is null;

create table apple_sign_ins (
  user_id        uuid primary key,
  refresh_token  text not null,
  created_at     timestamptz not null default now()
);

-- A circle: the people you share with. Its kind shapes what it is offered, never what it may hold.
create table circles (
  id          uuid primary key,
  kind        text not null check (kind in ('family', 'couple', 'flat', 'crew', 'solo')),
  name        text not null check (char_length(name) between 1 and 40),
  cover_media_id uuid references media(id) on delete set null,
  join_code   text not null unique,
  created_by  uuid references profiles(id) on delete set null,
  client_id   uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (created_by, client_id)
);
create index circles_created_by on circles (created_by);
create index circles_cover on circles (cover_media_id) where cover_media_id is not null;

-- Someone in a circle. A child or a pet is in it without a sign-in (user_id is null): an adult looks after
-- their things. Everything that is shared is shared with members, so one person is a different member in
-- each circle they are in.
create table members (
  id             uuid primary key,
  circle_id      uuid not null references circles(id) on delete cascade,
  user_id        uuid references profiles(id) on delete set null,
  name           text not null check (char_length(name) between 1 and 50),
  kind           text not null default 'person' check (kind in ('person', 'child', 'pet')),
  role           text not null default 'adult' check (role in ('owner', 'adult', 'teen', 'child', 'guest')),
  status         text not null default 'joined' check (status in ('joined', 'invited', 'no_phone', 'left')),
  avatar_media_id uuid references media(id) on delete set null,
  birthday       date,
  about          text not null default '' check (char_length(about) <= 60),
  facts          text[] not null default '{}',
  invited_email  text,
  tint           integer not null default 1 check (tint between 1 and 5),
  sees_library   boolean not null default true,
  sees_plan      boolean not null default true,
  sees_pages     boolean not null default true,
  client_id      uuid,
  created_at     timestamptz not null default now(),
  unique (circle_id, client_id)
);
create unique index members_one_per_person on members (circle_id, user_id) where user_id is not null;
create index members_user on members (user_id) where user_id is not null;
create index members_invited on members (lower(invited_email)) where invited_email is not null;
create index members_avatar on members (avatar_media_id) where avatar_media_id is not null;

-- Anything that can be shared: a page, a photo, an event, a bill, a password. Each kind keeps its own details
-- in its own table, under the same id. Who can see it is decided here, once, for all of them (see Rules).
create table things (
  id              uuid primary key,
  circle_id       uuid not null references circles(id) on delete cascade,
  owner_id        uuid not null references members(id) on delete cascade,
  kind            text not null,
  place           text not null check (place in ('plan', 'notes', 'library', 'money', 'vault')),
  title           text not null default '' check (char_length(title) <= 200),
  audience        text not null default 'me' check (audience in ('me', 'some', 'circle')),
  everyone_edits  boolean not null default true,
  client_id       uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (owner_id, client_id)
);
create index things_circle on things (circle_id, place, updated_at desc, id);
create index things_owner on things (owner_id);

-- "Some people": who, and whether they may change it.
create table thing_shares (
  thing_id   uuid not null references things(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  can_edit   boolean not null default false,
  primary key (thing_id, member_id)
);
create index thing_shares_member on thing_shares (member_id);

-- "Everyone except": hidden from one person, through a day (or for good when there is no day).
create table thing_hides (
  thing_id   uuid not null references things(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  through    date,
  primary key (thing_id, member_id)
);
create index thing_hides_member on thing_hides (member_id);

-- Who a thing is about, so a person's page can gather it ("Kept for her").
create table thing_about (
  thing_id   uuid not null references things(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  primary key (thing_id, member_id)
);
create index thing_about_member on thing_about (member_id);

-- A page of words. Notes grows spaces, folders and blocks around this later.
create table pages (
  thing_id  uuid primary key references things(id) on delete cascade,
  body      text not null default '' check (char_length(body) <= 100000)
);

-- A guest pass: chosen things for someone outside the circle, for a set time, on one phone, with no account.
create table guest_passes (
  id          uuid primary key,
  circle_id   uuid not null references circles(id) on delete cascade,
  made_by     uuid not null references members(id) on delete cascade,
  guest_name  text not null check (char_length(guest_name) between 1 and 50),
  token       text not null unique,
  code        text not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  device      text,
  wrong_codes integer not null default 0,
  ended_at    timestamptz,
  client_id   uuid,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (made_by, client_id)
);
create index guest_passes_circle on guest_passes (circle_id, ends_at desc);
create index guest_passes_made_by on guest_passes (made_by);

create table guest_pass_things (
  pass_id   uuid not null references guest_passes(id) on delete cascade,
  thing_id  uuid not null references things(id) on delete cascade,
  primary key (pass_id, thing_id)
);
create index guest_pass_things_thing on guest_pass_things (thing_id);
