-- Money: bills, sheets with formulas, and splitting costs. Nothing here moves money or reads a bank account:
-- it keeps count. Amounts are whole cents with a currency code per thing.

-- ---------- bills ----------

-- A bill: what the house pays, who to, and how it comes round. The amount and the day of each time it is due
-- are in bill_dues.
create table bills (
  thing_id      uuid primary key references things(id) on delete cascade,
  payee         text not null default '' check (char_length(payee) <= 120),
  emoji         text not null default '' check (char_length(emoji) <= 16),
  currency      text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  repeat        text not null default 'once' check (repeat in ('once', 'monthly', 'months', 'yearly')),
  every_months  integer not null default 1 check (every_months between 1 and 24),
  -- The day of the month it comes round on, kept so that a bill due on the 31st is due on the 31st again
  -- after a February.
  due_day       integer not null check (due_day between 1 and 31),
  subscription  boolean not null default false,
  pays          text not null default 'by_hand' check (pays in ('by_hand', 'standing_order', 'direct_debit')),
  remind_days   integer check (remind_days between 0 and 30),
  note          text not null default '' check (char_length(note) <= 2000),
  pay_url       text check (char_length(pay_url) <= 500),
  iban          text not null default '' check (char_length(iban) <= 42),
  reference     text not null default '' check (char_length(reference) <= 60)
);

-- Who pays a bill, and how much of it: parts of the whole (1 and 1 is half each). One row is someone paying
-- all of it.
create table bill_shares (
  thing_id   uuid not null references bills(thing_id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  parts      bigint not null check (parts between 1 and 100000000000),
  primary key (thing_id, member_id)
);
create index bill_shares_member on bill_shares (member_id);

-- Each time a bill is due. The one that is open has no paid_at; the paid ones are the bill's history.
-- Marking a repeating bill paid closes its open row and adds the next.
create table bill_dues (
  id            uuid primary key,
  thing_id      uuid not null references bills(thing_id) on delete cascade,
  due_on        date not null,
  amount_cents  bigint not null check (amount_cents between 0 and 100000000000),
  paid_at       timestamptz,
  paid_by       uuid references members(id) on delete set null,
  created_at    timestamptz not null default now()
);
create unique index bill_dues_open on bill_dues (thing_id) where paid_at is null;
create index bill_dues_bill on bill_dues (thing_id, due_on desc, id);
create index bill_dues_paid_by on bill_dues (paid_by) where paid_by is not null;

-- A share of one due time that has been paid: whose share, and who paid it.
create table bill_due_marks (
  due_id     uuid not null references bill_dues(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  paid_at    timestamptz not null default now(),
  paid_by    uuid references members(id) on delete set null,
  primary key (due_id, member_id)
);
create index bill_due_marks_member on bill_due_marks (member_id);
create index bill_due_marks_paid_by on bill_due_marks (paid_by) where paid_by is not null;

-- ---------- sheets ----------

-- A sheet: a spreadsheet made for a phone. It has tabs; a tab has typed columns, rows and tiles.
create table sheets (
  thing_id   uuid primary key references things(id) on delete cascade,
  currency   text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  template   text not null default '' check (char_length(template) <= 30),
  edited_by  uuid references members(id) on delete set null
);
create index sheets_edited_by on sheets (edited_by) where edited_by is not null;

create table sheet_tabs (
  id          uuid primary key,
  thing_id    uuid not null references sheets(thing_id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  position    double precision not null,
  client_id   uuid,
  created_at  timestamptz not null default now(),
  unique (thing_id, client_id)
);
create index sheet_tabs_sheet on sheet_tabs (thing_id, position, id);

-- A column has a kind, so a cost can't be typed as a word. A formula column holds one formula for the whole
-- column; it names other columns by their id, so renaming a column breaks nothing.
create table sheet_columns (
  id          uuid primary key,
  tab_id      uuid not null references sheet_tabs(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  kind        text not null check (kind in ('text', 'number', 'money', 'date', 'tick', 'choice', 'person', 'formula')),
  options     text[] not null default '{}',
  formula     text not null default '' check (char_length(formula) <= 2000),
  summary     text not null default 'none' check (summary in ('none', 'sum', 'avg', 'count', 'min', 'max', 'ticked')),
  position    double precision not null,
  client_id   uuid,
  created_at  timestamptz not null default now(),
  unique (tab_id, client_id)
);
create index sheet_columns_tab on sheet_columns (tab_id, position, id);
create unique index sheet_columns_name on sheet_columns (tab_id, lower(name));

-- A row. Its cells are kept by column id; a cell is changed one at a time (see SheetStore.setCells), so two
-- people editing the same row both keep what they did.
create table sheet_rows (
  id          uuid primary key,
  tab_id      uuid not null references sheet_tabs(id) on delete cascade,
  cells       jsonb not null default '{}',
  note        text not null default '' check (char_length(note) <= 2000),
  position    double precision not null,
  added_by    uuid references members(id) on delete set null,
  client_id   uuid,
  created_at  timestamptz not null default now(),
  unique (tab_id, client_id)
);
create index sheet_rows_tab on sheet_rows (tab_id, position, id);
create index sheet_rows_added_by on sheet_rows (added_by) where added_by is not null;

-- A tile on top of a tab: a named total, worked out by a formula over the columns. "Paid" can be shown
-- against another tile ("of Planned").
create table sheet_tiles (
  id          uuid primary key,
  tab_id      uuid not null references sheet_tabs(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  formula     text not null check (char_length(formula) between 1 and 2000),
  of_tile     uuid references sheet_tiles(id) on delete set null,
  position    double precision not null,
  client_id   uuid,
  created_at  timestamptz not null default now(),
  unique (tab_id, client_id)
);
create index sheet_tiles_tab on sheet_tiles (tab_id, position, id);
create index sheet_tiles_of on sheet_tiles (of_tile) where of_tile is not null;

-- Receipts and papers kept with a row.
create table sheet_row_papers (
  row_id      uuid not null references sheet_rows(id) on delete cascade,
  media_id    uuid not null references media(id) on delete cascade,
  added_by    uuid references members(id) on delete set null,
  client_id   uuid,
  created_at  timestamptz not null default now(),
  primary key (row_id, media_id),
  unique (row_id, client_id)
);
create index sheet_row_papers_media on sheet_row_papers (media_id);
create index sheet_row_papers_added_by on sheet_row_papers (added_by) where added_by is not null;

-- When a paper leaves its row (taken off, or the row, tab or sheet went), its file goes too.
create function drop_sheet_paper_file() returns trigger language plpgsql as $$
begin
  delete from media where id = old.media_id;
  return old;
end $$;
create trigger sheet_row_paper_removed after delete on sheet_row_papers
  for each row execute function drop_sheet_paper_file();

-- Who has a sheet open: "Alex is here too". One row per person, moved forward each time they read it.
create table sheet_viewers (
  thing_id   uuid not null references sheets(thing_id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  seen_at    timestamptz not null default now(),
  primary key (thing_id, member_id)
);
create index sheet_viewers_member on sheet_viewers (member_id);

-- ---------- splitting costs ----------

-- A group's shared costs: who paid what, who owes who.
create table splits (
  thing_id  uuid primary key references things(id) on delete cascade,
  currency  text not null default 'EUR' check (currency ~ '^[A-Z]{3}$')
);

create table split_expenses (
  id            uuid primary key,
  thing_id      uuid not null references splits(thing_id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 120),
  emoji         text not null default '' check (char_length(emoji) <= 16),
  amount_cents  bigint not null check (amount_cents between 1 and 100000000000),
  paid_by       uuid not null references members(id) on delete cascade,
  mode          text not null default 'equal' check (mode in ('equal', 'shares', 'exact')),
  spent_on      date not null,
  added_by      uuid references members(id) on delete set null,
  client_id     uuid,
  created_at    timestamptz not null default now(),
  unique (thing_id, client_id)
);
create index split_expenses_split on split_expenses (thing_id, spent_on desc, created_at desc, id);
create index split_expenses_paid_by on split_expenses (paid_by);
create index split_expenses_added_by on split_expenses (added_by) where added_by is not null;

-- Who shares an expense, by weight: 1 each for an equal split, the shares for a split by shares, the cents
-- themselves for exact amounts.
create table split_expense_shares (
  expense_id  uuid not null references split_expenses(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  weight      bigint not null check (weight between 1 and 100000000000),
  primary key (expense_id, member_id)
);
create index split_expense_shares_member on split_expense_shares (member_id);

-- A payment one person made to another to settle up. The app doesn't make it; someone says it was made.
create table split_payments (
  id            uuid primary key,
  thing_id      uuid not null references splits(thing_id) on delete cascade,
  from_member   uuid not null references members(id) on delete cascade,
  to_member     uuid not null references members(id) on delete cascade,
  amount_cents  bigint not null check (amount_cents between 1 and 100000000000),
  paid_on       date not null,
  noted_by      uuid references members(id) on delete set null,
  client_id     uuid,
  created_at    timestamptz not null default now(),
  check (from_member <> to_member),
  unique (thing_id, client_id)
);
create index split_payments_split on split_payments (thing_id, created_at desc, id);
create index split_payments_from on split_payments (from_member);
create index split_payments_to on split_payments (to_member);
create index split_payments_noted_by on split_payments (noted_by) where noted_by is not null;

-- The last time someone was reminded of what they owe in a split.
create table split_reminders (
  thing_id     uuid not null references splits(thing_id) on delete cascade,
  member_id    uuid not null references members(id) on delete cascade,
  by_member    uuid references members(id) on delete set null,
  reminded_at  timestamptz not null default now(),
  primary key (thing_id, member_id)
);
create index split_reminders_member on split_reminders (member_id);
create index split_reminders_by on split_reminders (by_member) where by_member is not null;
