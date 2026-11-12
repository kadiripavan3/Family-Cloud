-- Notes: spaces and folders, pages built from blocks, and what a shared list needs besides its lines.
--
-- The decision about containers, written down as asked.
--
-- A space and a folder ARE things, of one kind ('folder'). A space is simply a folder at the top; a folder
-- can hold folders, as deep as anyone files (the API stops at fifty levels). Each has an audience of its
-- own, changed with the same sheet as everything else, and that audience says one thing only: who sees the
-- shelf itself (its name, its emoji, that it exists). "Nora's work" can be a space nobody else knows about.
--
-- What it never says is who sees what stands on the shelf. A page or a list is seen by exactly whoever
-- Rules.sees says for that page or list, wherever it is filed. So:
--   * a folder shows a person only the things inside that they may see, and its counts count only those;
--   * a thing a person may see in a folder they may not see is still theirs to find: it is listed with
--     their things that aren't filed, and a folder whose parent they can't see hangs at the top for them;
--   * "share this folder" can be offered as "and everything in it": the folder's audience is then copied
--     onto each thing inside that the person owns (POST /v1/folders/{id}/share-inside). After that each thing
--     carries its own audience again. There is no second rule.
--   * deleting a folder never deletes what is in it: its things move up one level (from a space: its
--     folders become spaces, its pages wait under "not filed"). Its owner may not even see all of them.

create table folders (
  thing_id  uuid primary key references things(id) on delete cascade,
  emoji     text not null default '' check (char_length(emoji) <= 32)
);

-- Where a thing is filed, and where it stands among the others there (the order people gave them). One
-- thing, one place. A thing with no row here, or with no folder, isn't filed; a folder with no folder is a
-- space. Any kind of thing can be filed: a sheet stands next to a page.
create table filed (
  thing_id   uuid primary key references things(id) on delete cascade,
  folder_id  uuid references folders(thing_id) on delete set null,
  position   double precision not null,
  filed_at   timestamptz not null default now()
);
create index filed_folder on filed (folder_id, position, thing_id);

-- When a folder goes, what was in it moves up to where the folder stood. On things, before the delete, so it
-- has happened before anything is taken away underneath. When a whole circle goes, its folders go one after
-- the other in the same breath: only what is still there is moved, and only to a folder that is still there.
create function folder_contents_move_up() returns trigger language plpgsql as $$
begin
  update filed f set folder_id = (
      select up.folder_id from filed up join things stays on stays.id = up.folder_id where up.thing_id = old.id)
  where f.folder_id = old.id and exists (select 1 from things here where here.id = f.thing_id);
  return old;
end $$;
create trigger thing_folder_removed before delete on things
  for each row when (old.kind = 'folder') execute function folder_contents_move_up();

-- A pin is one person's own: what they keep at the top of Notes.
create table note_pins (
  member_id  uuid not null references members(id) on delete cascade,
  thing_id   uuid not null references things(id) on delete cascade,
  pinned_at  timestamptz not null default now(),
  primary key (member_id, thing_id)
);
create index note_pins_thing on note_pins (thing_id);

-- The circles whose starter spaces were made (the first time Notes was opened there), so they are made once
-- and stay gone when someone deletes them.
create table notes_started (
  circle_id   uuid primary key references circles(id) on delete cascade,
  started_at  timestamptz not null default now()
);

-- A page: its own emoji, who changed it last, and a number that goes up with every change, so a phone that
-- asks "anything new?" every few seconds gets a short no.
alter table pages
  add column emoji      text not null default '' check (char_length(emoji) <= 32),
  add column version    bigint not null default 0,
  add column edited_by  uuid references members(id) on delete set null,
  add column edited_at  timestamptz;
create index pages_edited_by on pages (edited_by) where edited_by is not null;

-- A page is built from blocks, in order. Each is changed by itself, so two people writing on one page both
-- keep what they did. pages.body stays as the page's plain words, kept in step with the blocks (search and
-- the guest's view read it).
--   paragraph, heading, bullet: text, with marks (bold, a link, a name) as ranges over it
--   checklist: a list, drawn in the page (thing_id is the list)
--   photo, file: an upload (media_id), with text as its caption
--   place: text as the words, and a point
--   live: another thing by its id (a bill, an event, a sheet, a goal, a password), shown as it stands today
create table page_blocks (
  id          uuid primary key,
  page_id     uuid not null references pages(thing_id) on delete cascade,
  kind        text not null check (kind in ('paragraph', 'heading', 'bullet', 'checklist', 'photo', 'file', 'place', 'live')),
  text        text not null default '' check (char_length(text) <= 100000),
  marks       jsonb not null default '[]',
  thing_id    uuid references things(id) on delete cascade,
  media_id    uuid references media(id) on delete cascade,
  lat         double precision check (lat between -90 and 90),
  lng         double precision check (lng between -180 and 180),
  position    double precision not null,
  added_by    uuid references members(id) on delete set null,
  client_id   uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (page_id, client_id),
  check ((kind in ('checklist', 'live')) = (thing_id is not null)),
  check ((kind in ('photo', 'file')) = (media_id is not null)),
  check ((lat is null) = (lng is null))
);
create index page_blocks_page on page_blocks (page_id, position, id);
create index page_blocks_thing on page_blocks (thing_id) where thing_id is not null;
create index page_blocks_media on page_blocks (media_id) where media_id is not null;
create index page_blocks_added_by on page_blocks (added_by) where added_by is not null;

-- A photo or file in a page was uploaded for that page. When its block goes (by itself, or with the page, the
-- circle or the account), the upload goes too, and the database queues the file for removal. One that is
-- also somebody's picture or a circle's cover stays.
create function page_block_media_gone() returns trigger language plpgsql as $$
begin
  delete from media m where m.id = old.media_id
    and not exists (select 1 from page_blocks b where b.media_id = m.id)
    and not exists (select 1 from profiles p where p.avatar_media_id = m.id)
    and not exists (select 1 from members mm where mm.avatar_media_id = m.id)
    and not exists (select 1 from circles c where c.cover_media_id = m.id);
  return null;
end $$;
create trigger page_block_removed after delete on page_blocks
  for each row when (old.media_id is not null) execute function page_block_media_gone();

-- A page written before blocks existed becomes one block of text.
insert into page_blocks (id, page_id, kind, text, position)
select gen_random_uuid(), p.thing_id, 'paragraph', p.body, 1 from pages p where p.body <> '';

-- A list: its emoji, the currency of its amounts, whether it is a shopping list (new lines find their aisle),
-- who changed it last, and the same number that goes up with every change.
alter table checklists
  add column emoji      text not null default '' check (char_length(emoji) <= 32),
  add column currency   text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  add column aisles     boolean not null default false,
  add column version    bigint not null default 0,
  add column edited_by  uuid references members(id) on delete set null,
  add column edited_at  timestamptz;
create index checklists_edited_by on checklists (edited_by) where edited_by is not null;

-- A line that comes back: milk, every week. Once ticked it unticks itself when its time has come round.
alter table checklist_items
  add column repeats text check (repeats in ('weekly', 'monthly'));
create index checklist_items_coming_back on checklist_items (done_at) where repeats is not null and done_at is not null;

-- A line kept from someone: the birthday candles on the list the birthday child also uses. To them the line
-- isn't there: not in the list, not in its counts, not in a search.
create table checklist_item_hides (
  item_id    uuid not null references checklist_items(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  primary key (item_id, member_id)
);
create index checklist_item_hides_member on checklist_item_hides (member_id);

-- One person and one list: whether they look at ticked lines, and what they last did in it and when ("Alex
-- is here now").
create table checklist_people (
  thing_id     uuid not null references checklists(thing_id) on delete cascade,
  member_id    uuid not null references members(id) on delete cascade,
  show_ticked  boolean not null default true,
  did          text check (did in ('added', 'ticked')),
  did_at       timestamptz,
  primary key (thing_id, member_id)
);
create index checklist_people_member on checklist_people (member_id);

-- What a list has held before, and how often: the things you buy most weeks, one tap away, and the aisle
-- each went under last time.
create table checklist_usuals (
  thing_id  uuid not null references checklists(thing_id) on delete cascade,
  key       text not null,
  text      text not null,
  section   text not null default '',
  times     integer not null default 1,
  last_at   timestamptz not null default now(),
  primary key (thing_id, key)
);
