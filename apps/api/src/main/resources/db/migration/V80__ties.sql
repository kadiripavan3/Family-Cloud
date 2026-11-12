-- What ties the places together: Activity, one outbox for every push, the Sunday summary, export, and asking
-- to see something.

-- ---------- settings ----------

-- "Hide details in notifications": a push then says that a bill is due, never which or how much.
alter table settings add column hide_details boolean not null default false;

-- A circle someone muted: nothing that happens in it is pushed to them. It is theirs alone to decide, so it
-- sits on their own place in the circle.
alter table members add column muted boolean not null default false;

-- ---------- Activity ----------

-- What happened in a circle, one line per person, thing, kind and day: the same person changing the same
-- list all afternoon is one line that counts up (fold_key is what makes it one). Written in the same
-- transaction as the change itself, through ActivityLog and nowhere else.
--
-- Who may read a line is never stored: a line about a thing is shown to whoever may see that thing at the
-- moment of reading (Rules.sees), and goes when the thing goes. A line about no thing (someone joined, a
-- guest pass was opened) says who it is for in shown_to.
--   member_id  who did it. A child without a phone counts: "Leo fed Biscuit".
--   who        the name of someone from outside the circle who did it (a guest), when there is no member
--   words      the sentence's own words when the place said them ("fed Biscuit and earned a star"), and
--              names_thing whether the thing's title then ends the sentence
--   counts     small numbers the sentence is made with: {"added": 9, "ticked": 5}
--   day        the day it is folded into
--   at         when it last happened; the list is read in this order
--   burst_at, push_after   for photos: when the burst that hasn't been pushed yet began, and when it is told
create table activity (
  id          uuid primary key,
  circle_id   uuid not null references circles(id) on delete cascade,
  kind        text not null,
  member_id   uuid references members(id) on delete cascade,
  who         text not null default '' check (char_length(who) <= 50),
  thing_id    uuid references things(id) on delete cascade,
  place       text check (place in ('plan', 'notes', 'library', 'money', 'vault')),
  shown_to    text not null default 'circle' check (shown_to in ('circle', 'adults', 'one')),
  only_for    uuid references members(id) on delete cascade,
  words       text not null default '' check (char_length(words) <= 200),
  names_thing boolean not null default false,
  note        text not null default '' check (char_length(note) <= 200),
  counts      jsonb not null default '{}',
  day         date not null,
  fold_key    text not null unique,
  at          timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  burst_at    timestamptz,
  push_after  timestamptz,
  check ((shown_to = 'one') = (only_for is not null))
);
create index activity_circle on activity (circle_id, at desc, id);
create index activity_member on activity (member_id) where member_id is not null;
create index activity_thing on activity (thing_id) where thing_id is not null;
create index activity_only_for on activity (only_for) where only_for is not null;
create index activity_to_push on activity (push_after) where push_after is not null;

-- The things one line is about when it is about many: the photos of a batch. The line counts, for each
-- reader, the ones that reader may see.
create table activity_items (
  line_id   uuid not null references activity(id) on delete cascade,
  thing_id  uuid not null references things(id) on delete cascade,
  added_at  timestamptz not null default now(),
  primary key (line_id, thing_id)
);
create index activity_items_thing on activity_items (thing_id);

-- When someone last opened Activity in a circle: what came after is new to them.
create table activity_seen (
  member_id  uuid primary key references members(id) on delete cascade,
  seen_at    timestamptz not null default now()
);

-- Asking to see something you know exists and can't open: today, an item in the Vault. The API keeps the
-- question and its answer. Allowing is done by the owner's phone (only it can wrap the key).
create table asks (
  id           uuid primary key,
  circle_id    uuid not null references circles(id) on delete cascade,
  thing_id     uuid not null references things(id) on delete cascade,
  asker_id     uuid not null references members(id) on delete cascade,
  owner_id     uuid not null references members(id) on delete cascade,
  -- How long they would like it for: until a moment ("for today only"), for one look, or neither.
  until        timestamptz,
  once         boolean not null default false,
  state        text not null default 'open' check (state in ('open', 'allowed', 'declined', 'withdrawn')),
  answered_at  timestamptz,
  client_id    uuid,
  created_at   timestamptz not null default now(),
  unique (asker_id, client_id)
);
-- One question at a time per person and thing.
create unique index asks_one_open on asks (thing_id, asker_id) where state = 'open';
create index asks_circle on asks (circle_id, created_at desc);
create index asks_thing on asks (thing_id);
create index asks_asker on asks (asker_id);
create index asks_owner on asks (owner_id, state);

-- The line an ask stands in, for its owner, and the line its answer stands in, for whoever asked.
alter table activity add column ask_id uuid references asks(id) on delete cascade;
create index activity_ask on activity (ask_id) where ask_id is not null;

-- ---------- the outbox of pushes ----------

-- One row per person per message, written in the same transaction as its cause and sent by a job, once.
-- Everything is checked again at the moment of sending: the person's settings, that they are still in the
-- circle and haven't muted it, and that they may still see the thing it is about (a thing that was deleted
-- takes its pushes with it).
--   quiet_title, quiet_body   what it says for someone who hides details; null: it says the same to everyone
--   always      true for news about someone's safety (the Vault's): the everyday switch doesn't silence it
--   once_key    the same key is never told twice, however often its cause is noticed
--   line_id, since   a batch of photos: the line it counts, and from when
create table pushes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  kind         text not null check (char_length(kind) between 1 and 60),
  circle_id    uuid references circles(id) on delete cascade,
  thing_id     uuid references things(id) on delete cascade,
  actor_id     uuid references members(id) on delete set null,
  line_id      uuid references activity(id) on delete cascade,
  since        timestamptz,
  title        text not null,
  body         text not null,
  quiet_title  text,
  quiet_body   text,
  url          text not null,
  always       boolean not null default false,
  once_key     text unique,
  status       text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'skipped')),
  attempts     integer not null default 0,
  send_after   timestamptz not null default now(),
  claimed_at   timestamptz,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index pushes_due on pushes (send_after) where status = 'pending';
create index pushes_sending on pushes (claimed_at) where status = 'sending';
create index pushes_user on pushes (user_id, created_at desc);
create index pushes_circle on pushes (circle_id) where circle_id is not null;
create index pushes_thing on pushes (thing_id) where thing_id is not null;
create index pushes_actor on pushes (actor_id) where actor_id is not null;
create index pushes_line on pushes (line_id) where line_id is not null;
create index pushes_age on pushes (created_at);

-- The Vault's own queue moves into the outbox: what was still waiting goes over, and the table goes.
insert into pushes (user_id, kind, title, body, url, always, attempts, send_after, created_at)
select user_id, kind, title, body, url, true, attempts, next_try_at, created_at from vault_notices where sent_at is null;
drop table vault_notices;

-- ---------- the Sunday summary ----------

-- Who has had which week's summary of which circle, so a job that is cut short simply carries on.
create table summaries_sent (
  user_id    uuid not null references profiles(id) on delete cascade,
  circle_id  uuid not null references circles(id) on delete cascade,
  week       text not null,
  sent_at    timestamptz not null default now(),
  primary key (user_id, circle_id, week)
);
create index summaries_sent_circle on summaries_sent (circle_id);

-- ---------- export ----------

-- One zip of what a person owns, or may see, in a circle. It is made in the background, kept under an
-- address that can't be guessed, and removed after seven days.
create table exports (
  id           uuid primary key,
  user_id      uuid not null references profiles(id) on delete cascade,
  circle_id    uuid not null references circles(id) on delete cascade,
  scope        text not null check (scope in ('mine', 'everything')),
  state        text not null default 'waiting' check (state in ('waiting', 'working', 'ready', 'failed')),
  storage_key  text,
  bytes        bigint,
  files        integer,
  -- What a bound kept out, in sentences a person can read.
  left_out     text[] not null default '{}',
  attempts     integer not null default 0,
  client_id    uuid,
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  ready_at     timestamptz,
  expires_at   timestamptz,
  unique (user_id, client_id)
);
create index exports_user on exports (user_id, created_at desc);
create index exports_circle on exports (circle_id);
create index exports_waiting on exports (created_at) where state = 'waiting';

-- When an export's record goes (it expired, or its person or circle went), its file is queued for removal.
create function export_file_gone() returns trigger language plpgsql as $$
begin
  if old.storage_key is not null then
    insert into removed_files (storage_key, has_sizes) values (old.storage_key, false);
  end if;
  return old;
end $$;
create trigger export_removed after delete on exports for each row execute function export_file_gone();
