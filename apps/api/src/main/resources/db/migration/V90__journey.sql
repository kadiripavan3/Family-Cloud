-- The link with Journey: journeys kept at home, journeys drafted from the Library, trips that are planned
-- here and told there, hearts at home on someone's entries, and goodnights from far away.
--
-- Nothing here is Journey's own data. A journey is named by the id Journey gave it (journey_id, entry_id,
-- media_id are Journey's ids and point at nothing in this database); what was brought home is kept as
-- ordinary things: a page in Notes, photos in the Library, an album.
--
-- A row here that remembers one of those things (the page of a kept journey, the photo a kept picture
-- became, the budget of a trip) holds its id without a "references". With one, and "on delete set null",
-- a member leaving with several of their things would clear two such pointers on the same row in one
-- breath, and the database then re-checks that row against parents that are being deleted beside it and
-- refuses the delete (the trouble V4 describes). A pointer whose thing is gone is simply read as "not
-- there any more": every read of it goes through the thing, as it must anyway to know who may see it.

-- What a circle says once for the link: where home is (so photos taken there stay home), when bedtime is
-- (so a goodnight waits until then), and which clock home keeps (so someone far away knows when that is).
-- A circle with no row has no home place yet, bedtime at eight, and no clock of its own.
create table journey_circle_settings (
  circle_id      uuid primary key references circles(id) on delete cascade,
  home_lat       double precision check (home_lat between -90 and 90),
  home_lng       double precision check (home_lng between -180 and 180),
  home_radius_m  integer not null default 150 check (home_radius_m between 25 and 5000),
  bedtime        time not null default '20:00',
  time_zone      text check (char_length(time_zone) between 1 and 64),
  updated_at     timestamptz not null default now(),
  check ((home_lat is null) = (home_lng is null))
);

-- A journey someone kept. The story is a page (page_id), the photos are in an album of the Library
-- (album_id); each is a thing with its own audience, and this row is seen by whoever may see one of them.
-- The numbers are Journey's own, as they stood when the journey was last asked for.
create table kept_journeys (
  id            uuid primary key,
  circle_id     uuid not null references circles(id) on delete cascade,
  kept_by       uuid not null references members(id) on delete cascade,
  journey_id    uuid not null,
  page_id       uuid,
  album_id      uuid,
  cover_media_id uuid,
  title         text not null check (char_length(title) between 1 and 200),
  byline        text not null default '' check (char_length(byline) <= 200),
  visibility    text not null default 'private' check (visibility in ('public', 'unlisted', 'private')),
  status        text not null default 'completed' check (status in ('active', 'paused', 'completed')),
  starts_on     date,
  ends_on       date,
  days          integer not null default 0,
  entries       integer not null default 0,
  photos        integer not null default 0,
  clips         integer not null default 0,
  places        integer not null default 0,
  followers     integer not null default 0,
  open_url      text,
  with_book     boolean not null default true,
  with_originals boolean not null default true,
  with_route    boolean not null default true,
  with_words    boolean not null default false,
  book_shots    integer not null default 6 check (book_shots between 0 and 6),
  book_day_words boolean not null default false,
  matched       integer not null default 0,
  brought       integer not null default 0,
  left_behind   integer not null default 0,
  kept_at       timestamptz not null default now(),
  synced_at     timestamptz,
  unique (kept_by, circle_id, journey_id)
);
create index kept_journeys_circle on kept_journeys (circle_id, kept_at desc);
create index kept_journeys_page on kept_journeys (page_id) where page_id is not null;
create index kept_journeys_album on kept_journeys (album_id) where album_id is not null;

-- The days of a kept journey: where each begins in the page (heading_block is a block of that page; it is
-- only remembered, so someone may delete the block) and how many photos and clips the day has in all.
create table kept_days (
  kept_id        uuid not null references kept_journeys(id) on delete cascade,
  day            date not null,
  number         integer not null,
  place          text,
  heading_block  uuid,
  shots          integer not null default 0,
  primary key (kept_id, day)
);

-- An entry that was kept. The key is what makes keeping safe to ask for again: an entry is here once.
create table kept_entries (
  kept_id      uuid not null references kept_journeys(id) on delete cascade,
  entry_id     uuid not null,
  day          date not null,
  happened_at  timestamptz not null,
  title        text not null default '',
  place        text,
  lat          double precision check (lat between -90 and 90),
  lng          double precision check (lng between -180 and 180),
  block        uuid,
  kept_at      timestamptz not null default now(),
  primary key (kept_id, entry_id),
  check ((lat is null) = (lng is null))
);
create index kept_entries_story on kept_entries (kept_id, happened_at, entry_id);

-- A photo or clip of a kept journey: the thing it is in the Library (item_id; matched says it was there
-- already, as the original from the phone), and the copy that stands in the page (page_media_id).
create table kept_media (
  kept_id        uuid not null references kept_journeys(id) on delete cascade,
  media_id       uuid not null,
  entry_id       uuid not null,
  kind           text not null check (kind in ('photo', 'video')),
  item_id        uuid,
  page_media_id  uuid,
  matched        boolean not null default false,
  primary key (kept_id, media_id)
);
create index kept_media_item on kept_media (item_id) where item_id is not null;
create index kept_media_entry on kept_media (kept_id, entry_id);

-- Work that takes longer than a request: keeping a journey, sending a draft. The screen asks how far it is.
-- The person's sign-in is never written here: a job that was cut off (a deploy) is asked for again.
create table journey_jobs (
  id           uuid primary key,
  user_id      uuid not null references profiles(id) on delete cascade,
  circle_id    uuid not null references circles(id) on delete cascade,
  kind         text not null check (kind in ('keep', 'post')),
  subject_id   uuid,
  status       text not null default 'waiting' check (status in ('waiting', 'running', 'done', 'failed')),
  step         text not null default '',
  done         integer not null default 0,
  total        integer not null default 0,
  problem      text,
  client_id    uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, client_id)
);
create index journey_jobs_circle on journey_jobs (circle_id);
create index journey_jobs_subject on journey_jobs (subject_id, created_at desc) where subject_id is not null;

-- A journey being drafted from the Library. It is its writer's alone until it is sent, and nothing in it
-- has left home: the three switches of "Before it leaves home" start on.
create table journey_drafts (
  id                  uuid primary key,
  circle_id           uuid not null references circles(id) on delete cascade,
  owner_id            uuid not null references members(id) on delete cascade,
  title               text not null check (char_length(title) between 1 and 80),
  source_kind         text not null check (source_kind in ('moment', 'album', 'trip')),
  source_id           uuid,
  source_title        text not null default '',
  visibility          text not null default 'private' check (visibility in ('public', 'unlisted', 'private')),
  leave_out_children  boolean not null default true,
  town_only           boolean not null default true,
  skip_home           boolean not null default true,
  status              text not null default 'draft' check (status in ('draft', 'posting', 'posted', 'failed')),
  journey_id          uuid,
  open_url            text,
  client_id           uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (owner_id, client_id)
);
create index journey_drafts_circle on journey_drafts (circle_id);

create table journey_draft_days (
  draft_id  uuid not null references journey_drafts(id) on delete cascade,
  day       date not null,
  line      text not null default '' check (char_length(line) <= 2000),
  place     text,
  primary key (draft_id, day)
);

-- A photo or video in a draft: its day, whether its writer dropped it, and whether they switched it back on
-- after a rule left it out.
create table journey_draft_items (
  draft_id  uuid not null references journey_drafts(id) on delete cascade,
  item_id   uuid not null references library_items(thing_id) on delete cascade,
  day       date not null,
  position  integer not null,
  dropped   boolean not null default false,
  back_on   boolean not null default false,
  primary key (draft_id, item_id)
);
create index journey_draft_items_item on journey_draft_items (item_id);

-- A trip: a folder in Notes with dates. It is planned here, becomes a journey on its first day, and comes
-- back as a book. The folder is the thing; who sees the trip is who sees the folder.
create table trips (
  folder_id         uuid primary key references folders(thing_id) on delete cascade,
  starts_on         date not null,
  ends_on           date not null,
  sheet_id          uuid,
  journey_id        uuid,
  journey_open_url  text,
  became_at         timestamptz,
  kept_id           uuid,
  created_at        timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index trips_kept on trips (kept_id) where kept_id is not null;

-- A heart given at home to an entry of someone's journey. It stays here: Journey is never told.
create table journey_entry_loves (
  circle_id   uuid not null references circles(id) on delete cascade,
  entry_id    uuid not null,
  journey_id  uuid not null,
  member_id   uuid not null references members(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (circle_id, entry_id, member_id)
);
create index journey_entry_loves_member on journey_entry_loves (member_id);

-- A goodnight: a short clip recorded for the circle by someone who is away. It is a thing like any other
-- (who sees it is decided where that is decided for everything), and never part of a journey.
create table goodnights (
  thing_id         uuid primary key references things(id) on delete cascade,
  circle_id        uuid not null references circles(id) on delete cascade,
  media_id         uuid not null references media(id) on delete cascade,
  poster_media_id  uuid references media(id) on delete set null,
  recorded_at      timestamptz not null,
  recorded_local   timestamp not null,
  for_day          date not null,
  place            text check (char_length(place) between 1 and 80),
  day_label        text check (char_length(day_label) between 1 and 40),
  journey_id       uuid,
  reply_to         uuid,
  created_at       timestamptz not null default now()
);
create index goodnights_circle on goodnights (circle_id, recorded_at desc, thing_id desc);
create unique index goodnights_media on goodnights (media_id);
create index goodnights_poster on goodnights (poster_media_id) where poster_media_id is not null;
create index goodnights_reply on goodnights (reply_to) where reply_to is not null;

-- When a goodnight goes, its clip and its still go with it.
create function goodnight_gone() returns trigger language plpgsql as $$
begin
  delete from media m where m.id in (old.media_id, old.poster_media_id)
    and not exists (select 1 from goodnights g where g.media_id = m.id or g.poster_media_id = m.id);
  return old;
end $$;
create trigger goodnight_removed after delete on goodnights for each row execute function goodnight_gone();

create table goodnight_loves (
  thing_id    uuid not null references goodnights(thing_id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (thing_id, member_id)
);
create index goodnight_loves_member on goodnight_loves (member_id);
