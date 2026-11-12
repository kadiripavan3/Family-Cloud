-- Local mode only: the stand-in for Journey. With the real link, Journey's own API keeps all of this.
--
-- A sample person has a Journey profile when there is a row for them here; their name and picture are the
-- ones they have in this app (it is one account). A journey is kept whole in one document: its facts, who
-- writes in it, who follows it, and its entries with their photos.
create table local_journey_people (
  user_id    uuid primary key references local_users(id) on delete cascade,
  username   text not null unique,
  following  integer not null default 0,
  followers  integer not null default 0
);

create table local_journeys (
  id          uuid primary key,
  owner_id    uuid not null references local_users(id) on delete cascade,
  doc         jsonb not null,
  created_at  timestamptz not null default now()
);
create index local_journeys_owner on local_journeys (owner_id);
