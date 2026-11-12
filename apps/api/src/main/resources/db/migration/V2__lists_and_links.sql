-- Two things every place uses: a list you tick, and a link from one thing to another.

-- A checklist: shopping, packing, party prep. Its lines are changed one at a time, so two people ticking at
-- once never undo each other.
create table checklists (
  thing_id  uuid primary key references things(id) on delete cascade
);

create table checklist_items (
  id            uuid primary key,
  thing_id      uuid not null references checklists(thing_id) on delete cascade,
  text          text not null check (char_length(text) between 1 and 300),
  note          text not null default '' check (char_length(note) <= 300),
  section       text not null default '' check (char_length(section) <= 60),
  amount_cents  bigint check (amount_cents between 0 and 100000000000),
  position      double precision not null,
  done_at       timestamptz,
  done_by       uuid references members(id) on delete set null,
  assigned_to   uuid references members(id) on delete set null,
  added_by      uuid references members(id) on delete set null,
  client_id     uuid,
  created_at    timestamptz not null default now(),
  unique (thing_id, client_id)
);
create index checklist_items_list on checklist_items (thing_id, position, id);
create index checklist_items_done_by on checklist_items (done_by) where done_by is not null;
create index checklist_items_assigned_to on checklist_items (assigned_to) where assigned_to is not null;
create index checklist_items_added_by on checklist_items (added_by) where added_by is not null;

-- Things know about each other: a bill and its login, an event and its list, its budget and its album.
-- A link is seen from both ends, by whoever may see both.
create table thing_links (
  from_id     uuid not null references things(id) on delete cascade,
  to_id       uuid not null references things(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (from_id, to_id),
  check (from_id <> to_id)
);
create index thing_links_to on thing_links (to_id);
