-- Templates that do work ("boards"): a meal plan that writes the shopping list, a capsule that opens on a date,
-- a jar nobody reads until New Year's Eve. Every one of them is a thing of kind 'board', so it is shared, hidden,
-- found and deleted like a page. What is different from template to template lives in Java (one class of rules
-- each); the two tables here are the same for all of them.

-- A board: which template it is, and the few settings that template needs (names, dates, numbers).
create table boards (
  thing_id  uuid primary key references things(id) on delete cascade,
  template  text not null check (char_length(template) between 1 and 40),
  settings  jsonb not null default '{}'
);

-- What is on a board, one row at a time: a meal, a letter, a height mark, a tick. The template's own details
-- are in doc. The columns beside it are the ones rules and queries need whatever the template is:
--   author_id  who wrote it down (the signed-in person's member)
--   for_id     the member it is for or about: the cook, the reader of a letter, the child who was measured
--   parent_id  the entry it belongs under: an answer under its question, a tick under its job
--   day        the calendar day it belongs to, or opens on
--   opens_at   the moment it opens, or is due
--   done_at    its tick: sealed, opened, answered, done (and done_by, who did that)
--   media_id   its photo or its recording. An entry owns its file: when the entry goes, the file goes.
--   amount     its number: millimetres, stars, an age, a year
--   token      the unguessable end of a link for someone outside the circle
--   position   where it stands among the others; a list of entries is read in this order
create table board_entries (
  id          uuid primary key,
  board_id    uuid not null references boards(thing_id) on delete cascade,
  parent_id   uuid references board_entries(id) on delete cascade,
  kind        text not null check (char_length(kind) between 1 and 40),
  author_id   uuid references members(id) on delete set null,
  for_id      uuid references members(id) on delete set null,
  doc         jsonb not null default '{}',
  day         date,
  opens_at    timestamptz,
  done_at     timestamptz,
  done_by     uuid references members(id) on delete set null,
  media_id    uuid references media(id) on delete set null,
  amount      bigint,
  token       text unique,
  position    double precision not null,
  client_id   uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (board_id, client_id)
);
create index board_entries_board on board_entries (board_id, position, id);
create index board_entries_days on board_entries (board_id, kind, day) where day is not null;
create index board_entries_parent on board_entries (parent_id) where parent_id is not null;
create index board_entries_author on board_entries (author_id) where author_id is not null;
create index board_entries_for on board_entries (for_id) where for_id is not null;
create index board_entries_done_by on board_entries (done_by) where done_by is not null;
create index board_entries_media on board_entries (media_id) where media_id is not null;

-- An entry owns its photo or recording. When the entry is removed (by itself, with its board, or with the
-- whole circle), or is given another file, the old file's record goes too, and the media table queues the
-- file itself for removal.
create function board_entry_file_gone() returns trigger language plpgsql as $$
begin
  if old.media_id is not null and (tg_op = 'DELETE' or new.media_id is distinct from old.media_id) then
    delete from media where id = old.media_id;
  end if;
  return old;
end $$;
create trigger board_entry_file_gone after delete or update of media_id on board_entries
  for each row execute function board_entry_file_gone();
