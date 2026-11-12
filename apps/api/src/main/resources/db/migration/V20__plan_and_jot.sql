-- Plan (events, reminders, goals) and Jot (one line that files itself).

-- An event. Its day and time are kept as the clock on the wall shows them where it happens, with the time
-- zone next to them, so "Thursdays at 17:00" stays at 17:00 when the clocks change. No start time means all day.
-- repeat_unit says whether it comes round again (see Recurrence). alert_at is the moment its next push is due:
-- the job that sends pushes takes the rows whose moment has come and moves it on, so each is sent once.
create table events (
  thing_id        uuid primary key references things(id) on delete cascade,
  starts_on       date not null,
  start_time      time,
  ends_on         date not null,
  end_time        time,
  time_zone       text not null default 'UTC',
  place_words     text not null default '' check (char_length(place_words) <= 200),
  notes           text not null default '' check (char_length(notes) <= 4000),
  cover_media_id  uuid references media(id) on delete set null,
  remind_minutes  integer check (remind_minutes between 0 and 40320),
  repeat_unit     text check (repeat_unit in ('day', 'week', 'month', 'year')),
  repeat_every    integer not null default 1 check (repeat_every between 1 and 99),
  repeat_days     text[] not null default '{}',
  repeat_until    date,
  alert_at        timestamptz,
  check (ends_on >= starts_on)
);
create index events_cover on events (cover_media_id) where cover_media_id is not null;
create index events_alert on events (alert_at) where alert_at is not null;

-- Who is coming: someone of the circle, or a name from outside it. "part" is what they do there
-- ("is taking her", "drives"). The first one of the circle is who the event is for. Changed one row at a
-- time, so two people answering at once both count.
create table event_guests (
  id          uuid primary key,
  thing_id    uuid not null references events(thing_id) on delete cascade,
  member_id   uuid references members(id) on delete cascade,
  name        text not null default '' check (char_length(name) <= 50),
  part        text not null default '' check (char_length(part) <= 80),
  answer      text check (answer in ('going', 'maybe', 'cant')),
  position    integer not null,
  client_id   uuid,
  created_at  timestamptz not null default now(),
  check (member_id is not null or name <> ''),
  unique (thing_id, client_id)
);
create unique index event_guests_once on event_guests (thing_id, member_id) where member_id is not null;
create index event_guests_event on event_guests (thing_id, position, id);
create index event_guests_member on event_guests (member_id) where member_id is not null;

-- A reminder: something to do. It is due on a day (and maybe at a time), or it waits for a place, or neither.
-- One that repeats has one due day at a time: ticking it writes a row to reminder_ticks and moves due_on to
-- the next time round. done_at is only set on one that doesn't repeat.
create table reminders (
  thing_id        uuid primary key references things(id) on delete cascade,
  due_on          date,
  due_time        time,
  time_zone       text not null default 'UTC',
  notes           text not null default '' check (char_length(notes) <= 4000),
  remind_minutes  integer not null default 0 check (remind_minutes between 0 and 40320),
  repeat_unit     text check (repeat_unit in ('day', 'week', 'month', 'year')),
  repeat_every    integer not null default 1 check (repeat_every between 1 and 99),
  repeat_days     text[] not null default '{}',
  repeat_until    date,
  takes_turns     boolean not null default false,
  turn_member_id  uuid references members(id) on delete set null,
  place_words     text not null default '' check (char_length(place_words) <= 200),
  place_lat       double precision check (place_lat between -90 and 90),
  place_lng       double precision check (place_lng between -180 and 180),
  place_radius_m  integer check (place_radius_m between 50 and 5000),
  stars           integer not null default 0 check (stars between 0 and 20),
  done_at         timestamptz,
  done_by         uuid references members(id) on delete set null,
  nudged_at       timestamptz,
  alert_at        timestamptz,
  check (due_time is null or due_on is not null)
);
create index reminders_turn on reminders (turn_member_id) where turn_member_id is not null;
create index reminders_done_by on reminders (done_by) where done_by is not null;
create index reminders_alert on reminders (alert_at) where alert_at is not null;

-- Who a reminder is given to, in the order they take turns when it takes turns.
create table reminder_people (
  thing_id   uuid not null references reminders(thing_id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  position   integer not null,
  primary key (thing_id, member_id)
);
create index reminder_people_member on reminder_people (member_id);

-- Each time a reminder was ticked: for which due day, by whom, and whose job it was. A due day is ticked
-- once, so a tick sent twice counts once and a turn is never skipped.
create table reminder_ticks (
  id         uuid primary key,
  thing_id   uuid not null references reminders(thing_id) on delete cascade,
  due_on     date,
  done_at    timestamptz not null default now(),
  done_by    uuid references members(id) on delete set null,
  done_for   uuid references members(id) on delete set null,
  stars      integer not null default 0
);
create unique index reminder_ticks_once on reminder_ticks (thing_id, due_on) where due_on is not null;
create index reminder_ticks_reminder on reminder_ticks (thing_id, done_at desc, id desc);
create index reminder_ticks_done_by on reminder_ticks (done_by) where done_by is not null;
create index reminder_ticks_done_for on reminder_ticks (done_for) where done_for is not null;

-- A goal: a target and how far it has got. Money is in cents. How far is the sum of what people put in
-- (goal_entries), the ticks of a checklist (steps_list_id), or a number read from elsewhere (source_kind and
-- source_ref name where; what was put in by hand stands in until that place can be read).
create table goals (
  thing_id        uuid primary key references things(id) on delete cascade,
  blurb           text not null default '' check (char_length(blurb) <= 300),
  emoji           text not null default '' check (char_length(emoji) <= 16),
  cover_media_id  uuid references media(id) on delete set null,
  unit            text not null default 'count' check (unit in ('money', 'count')),
  currency        text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  unit_words      text not null default '' check (char_length(unit_words) <= 20),
  target          bigint not null check (target between 1 and 100000000000),
  how             text not null default 'number' check (how in ('number', 'ticks', 'source')),
  steps_list_id   uuid references things(id) on delete set null,
  source_kind     text check (source_kind in ('sheet', 'journey')),
  source_ref      text check (char_length(source_ref) <= 300),
  source_words    text not null default '' check (char_length(source_words) <= 120),
  starts_on       date not null default current_date,
  target_on       date
);
create index goals_cover on goals (cover_media_id) where cover_media_id is not null;
create index goals_steps on goals (steps_list_id) where steps_list_id is not null;

-- What someone put into a goal: "Alex added €150 · payday". Negative when something was taken out.
create table goal_entries (
  id          uuid primary key,
  thing_id    uuid not null references goals(thing_id) on delete cascade,
  member_id   uuid references members(id) on delete set null,
  amount      bigint not null check (amount between -100000000000 and 100000000000 and amount <> 0),
  note        text not null default '' check (char_length(note) <= 200),
  on_day      date not null,
  client_id   uuid,
  created_at  timestamptz not null default now(),
  unique (thing_id, client_id)
);
create index goal_entries_goal on goal_entries (thing_id, on_day desc, created_at desc, id desc);
create index goal_entries_member on goal_entries (member_id) where member_id is not null;

-- The checklist a circle uses as its shopping list. Something jotted that reads like shopping lands in it.
create table shopping_lists (
  circle_id  uuid primary key references circles(id) on delete cascade,
  list_id    uuid not null references things(id) on delete cascade,
  marked_by  uuid references members(id) on delete set null,
  marked_at  timestamptz not null default now()
);
create index shopping_lists_list on shopping_lists (list_id);
create index shopping_lists_marked_by on shopping_lists (marked_by) where marked_by is not null;

-- Every jot: the words, where they came from, and what they became. One line can hold several things, so a
-- line is a batch (the clientId it was sent with) of rows. thing_id is the event, reminder or page that was
-- made, or the list a line went to (item_id is then the line). Something that looked like a code or a
-- password (became = 'code') has neither: it was held back, its words wait here until the person says what
-- to do with them, and the row is removed or turned into something else then.
create table jots (
  id          uuid primary key,
  circle_id   uuid not null references circles(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  batch_id    uuid not null,
  position    integer not null,
  source      text not null check (source in ('app', 'widget', 'notification', 'voice', 'share', 'lock_screen')),
  words       text not null check (char_length(words) between 1 and 2000),
  became      text not null check (became in ('event', 'reminder', 'list_item', 'note', 'code')),
  title       text not null default '' check (char_length(title) <= 300),
  thing_id    uuid references things(id) on delete set null,
  item_id     uuid references checklist_items(id) on delete set null,
  moves       integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (member_id, batch_id, position)
);
create index jots_mine on jots (member_id, created_at desc, id desc);
create index jots_circle on jots (circle_id, created_at desc);
create index jots_thing on jots (thing_id) where thing_id is not null;
create index jots_item on jots (item_id) where item_id is not null;

-- The ways in a person has switched on, and where their jots go when it isn't obvious.
create table jot_ways (
  user_id      uuid primary key references profiles(id) on delete cascade,
  pinned_note  boolean not null default false,
  voice        boolean not null default true,
  share        boolean not null default true,
  timed_as     text not null default 'reminder' check (timed_as in ('reminder', 'event')),
  codes        text not null default 'ask' check (codes in ('ask', 'vault', 'note')),
  updated_at   timestamptz not null default now()
);

-- What a person chose in one circle: the list their shopping goes to, and the list they are using right now
-- (shown on the Lock Screen for a few hours).
create table jot_places (
  member_id       uuid primary key references members(id) on delete cascade,
  buy_list_id     uuid references things(id) on delete set null,
  in_use_list_id  uuid references things(id) on delete set null,
  in_use_since    timestamptz
);
create index jot_places_buy on jot_places (buy_list_id) where buy_list_id is not null;
create index jot_places_in_use on jot_places (in_use_list_id) where in_use_list_id is not null;
