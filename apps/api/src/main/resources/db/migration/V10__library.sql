-- The Library: photos, videos and documents from everyone, the albums they are put in, who loved what.

-- A photo that goes into the Library keeps the file as it arrived, at full size, next to the three sizes
-- made from it (Journey threw the upload away). The original has an address of its own that can't be guessed,
-- and its fingerprint is written down so the same photo is recognised when it is sent again.
alter table media add column keep_original boolean not null default false;
alter table media add column original_key text;
alter table media add column original_bytes bigint;
alter table media add column content_hash text check (content_hash ~ '^[0-9a-f]{64}$');

-- When a media record goes, its original goes with it.
create or replace function queue_removed_file() returns trigger language plpgsql as $$
begin
  insert into removed_files (storage_key, has_sizes) values (old.storage_key, old.has_sizes);
  if old.original_key is not null then
    insert into removed_files (storage_key, has_sizes) values (old.original_key, false);
  end if;
  return old;
end $$;

-- A photo, a video or a document. Who may see it is decided by the thing it is. What the phone said about the
-- file (when, where, how long) is kept here and never decides who sees what.
--
-- circle_id and kind repeat what the thing says, so the wall can be read in order through one index.
-- taken_local is the clock where it was taken: days, months and years are read from it, and the wall is
-- ordered by it. day is the day it counts for when moments are put together (a day turns at four in the
-- morning, so a party that runs past midnight stays one evening).
create table library_items (
  thing_id         uuid primary key references things(id) on delete cascade,
  circle_id        uuid not null references circles(id) on delete cascade,
  kind             text not null check (kind in ('photo', 'video', 'document')),
  media_id         uuid not null references media(id) on delete cascade,
  poster_media_id  uuid references media(id) on delete set null,
  added_by         uuid references members(id) on delete set null,
  taken_at         timestamptz not null,
  taken_local      timestamp not null,
  day              date not null,
  lat              double precision check (lat between -90 and 90),
  lng              double precision check (lng between -180 and 180),
  place_name       text check (char_length(place_name) between 1 and 80),
  country          text check (char_length(country) between 1 and 60),
  content_hash     text check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at       timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
create index library_items_wall on library_items (circle_id, taken_local desc, thing_id desc);
create index library_items_day on library_items (circle_id, day);
create index library_items_new on library_items (circle_id, created_at desc);
create index library_items_place on library_items (circle_id, lower(place_name)) where place_name is not null;
create unique index library_items_media on library_items (media_id);
create index library_items_poster on library_items (poster_media_id) where poster_media_id is not null;
create index library_items_added_by on library_items (added_by) where added_by is not null;
create index library_items_hash on library_items (content_hash) where content_hash is not null;

-- When a photo, video or document goes (deleted, or its circle or its owner went), its files go with it,
-- unless something else still uses them (a photo that was also made somebody's picture).
create function library_item_gone() returns trigger language plpgsql as $$
begin
  delete from media m
  where m.id in (old.media_id, old.poster_media_id)
    and not exists (select 1 from library_items i where i.media_id = m.id or i.poster_media_id = m.id)
    and not exists (select 1 from profiles p where p.avatar_media_id = m.id)
    and not exists (select 1 from members mm where mm.avatar_media_id = m.id)
    and not exists (select 1 from circles c where c.cover_media_id = m.id);
  return old;
end $$;
create trigger library_item_removed after delete on library_items for each row execute function library_item_gone();

-- What a document adds: the words the phone read inside it (the API never reads a picture itself), and what
-- was found in those words by rule. key_date is the day that matters (it expires, it renews, it is due).
create table documents (
  thing_id      uuid primary key references library_items(thing_id) on delete cascade,
  text          text not null default '' check (char_length(text) <= 200000),
  pages         integer check (pages between 1 and 5000),
  category      text not null default 'other'
                check (category in ('id', 'insurance', 'school', 'receipt', 'recipe', 'manual', 'tax', 'health', 'home', 'other')),
  key_date      date,
  key_label     text check (key_label in ('expires', 'valid_until', 'renews', 'due', 'warranty')),
  key_by_hand   boolean not null default false,
  amount_cents  bigint check (amount_cents between 0 and 100000000000),
  currency      text check (currency ~ '^[A-Z]{3}$'),
  check ((key_date is null) = (key_label is null)),
  check ((amount_cents is null) = (currency is null))
);

-- An album. Made by hand (things are put into it one by one), or filling itself with everything about one
-- member, or brought home from Journey. A folder is an album for files. Its own audience decides who sees the
-- album; each thing in it is still only shown to someone who may see that thing.
create table albums (
  thing_id       uuid primary key references things(id) on delete cascade,
  note           text not null default '' check (char_length(note) <= 80),
  origin         text not null default 'hand' check (origin in ('hand', 'person', 'journey')),
  person_id      uuid references members(id) on delete set null,
  folder         boolean not null default false,
  cover_item_id  uuid references library_items(thing_id) on delete set null,
  check (origin = 'person' or person_id is null)
);
create index albums_person on albums (person_id) where person_id is not null;
create index albums_cover on albums (cover_item_id) where cover_item_id is not null;

create table album_items (
  album_id  uuid not null references albums(thing_id) on delete cascade,
  item_id   uuid not null references library_items(thing_id) on delete cascade,
  added_by  uuid references members(id) on delete set null,
  added_at  timestamptz not null default now(),
  primary key (album_id, item_id)
);
create index album_items_item on album_items (item_id);
create index album_items_added_by on album_items (added_by) where added_by is not null;

-- A heart is one member's.
create table library_loves (
  thing_id    uuid not null references library_items(thing_id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (thing_id, member_id)
);
create index library_loves_member on library_loves (member_id);

-- A few words under a photo.
create table library_comments (
  id          uuid primary key,
  thing_id    uuid not null references library_items(thing_id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 1000),
  client_id   uuid,
  created_at  timestamptz not null default now(),
  unique (member_id, client_id)
);
create index library_comments_thing on library_comments (thing_id, created_at, id);
