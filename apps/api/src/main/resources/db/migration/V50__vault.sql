-- The Vault: passwords, cards, IDs, Wi‑Fi, door codes and secrets.
--
-- Everything secret in these tables was scrambled on a phone before it arrived. The API stores it and decides
-- who is handed which scrambled piece and when; it holds no key that opens any of it. What each column holds
-- and who made it is written out in docs/07-vault-protocol.md.
--
-- "Sealed" below always means: unreadable text (base64url) made on a phone.

-- A person's Vault: a key pair made on their phone. The public key is here for other people's phones to seal
-- to. The private key is here too, but wrapped with a key made from the Vault key (24 characters the person
-- saw once and the API never does), so a new phone can fetch it and open it with the Vault key typed in.
create table vaults (
  user_id              uuid primary key references profiles(id) on delete cascade,
  public_key           text not null check (char_length(public_key) = 43),
  wrapped_private_key  text not null check (char_length(wrapped_private_key) between 1 and 512),
  -- How the Vault key becomes the key that opens wrapped_private_key: scrypt with this salt and these numbers.
  kdf_salt             text not null check (char_length(kdf_salt) between 16 and 64),
  kdf_n                integer not null check (kdf_n between 16384 and 4194304),
  kdf_r                integer not null check (kdf_r between 1 and 32),
  kdf_p                integer not null check (kdf_p between 1 and 16),
  -- Counts up each time the Vault key is replaced.
  key_version          integer not null default 1,
  -- When the person said "I've saved my key". Null again after the key is replaced.
  key_saved_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- An item in the Vault. It is a thing, so the one sharing rule decides who knows it exists and sees its title.
-- In the clear: what kind it is, a site or label, when an ID runs out, and how good the password is as far
-- as the phone could tell. Everything else is in ciphertext, sealed with the item's own key.
create table vault_items (
  thing_id         uuid primary key references things(id) on delete cascade,
  category         text not null check (category in ('login', 'card', 'id', 'wifi', 'code', 'secret')),
  site             text not null default '' check (char_length(site) <= 120),
  expires_on       date,
  health           text not null default 'ok' check (health in ('ok', 'weak', 'reused', 'leaked')),
  ciphertext       text not null check (char_length(ciphertext) between 1 and 87382),
  -- Counts up with every new ciphertext, so two people saving at once can't silently undo each other.
  version          integer not null default 1,
  -- With "everyone": what someone gets who wasn't given something else by name.
  everyone_access  text not null default 'see' check (everyone_access in ('use', 'see', 'change')),
  changed_by       uuid references members(id) on delete set null,
  changed_at       timestamptz not null default now()
);
create index vault_items_expiry on vault_items (expires_on) where expires_on is not null;
create index vault_items_changed_by on vault_items (changed_by) where changed_by is not null;

-- Who may open an item: the item's key, wrapped for one person (sealed to their public key). The owner has a
-- row too. A row without a wrapped key is someone who should have it and waits for the owner's phone to make
-- one. "Once" is used up as it is handed out: the wrapped key is erased and used_at says when.
create table vault_grants (
  thing_id      uuid not null references vault_items(thing_id) on delete cascade,
  member_id     uuid not null references members(id) on delete cascade,
  access        text not null check (access in ('use', 'see', 'change')),
  once          boolean not null default false,
  stops_at      timestamptz,
  wrapped_key   text check (char_length(wrapped_key) between 1 and 512),
  used_at       timestamptz,
  -- The last time the API handed this person the item, and how often it has.
  opened_at     timestamptz,
  opened_times  integer not null default 0,
  -- The last time this person saved a change to the item.
  changed_at    timestamptz,
  given_at      timestamptz not null default now(),
  primary key (thing_id, member_id)
);
create index vault_grants_member on vault_grants (member_id);
create index vault_grants_stops on vault_grants (stops_at) where stops_at is not null and wrapped_key is not null;

-- Someone who leaves a circle (or is removed, or deletes their account) loses every grant in it at that
-- moment, whoever marks them as gone. What was shared with them by name goes in MemberStore.markLeft.
create function vault_member_left() returns trigger language plpgsql as $$
begin
  delete from vault_grants where member_id = new.id;
  return new;
end $$;
create trigger members_left_vault after update of status on members
  for each row when (new.status = 'left' and old.status is distinct from 'left')
  execute function vault_member_left();

-- "If something happens": one person the owner trusts, a wait, and an escrow the API keeps and hands to
-- nobody until the trusted person has asked and the wait is over without a no.
create table vault_emergencies (
  id          uuid primary key,
  owner_id    uuid not null unique references profiles(id) on delete cascade,
  trusted_id  uuid not null references profiles(id) on delete cascade,
  wait_hours  integer not null default 48 check (wait_hours between 24 and 168),
  -- A note for the family, sealed for the trusted person; and the same note sealed for its writer, so their
  -- own phone can show it again.
  note        text check (char_length(note) between 1 and 22000),
  note_mine   text check (char_length(note_mine) between 1 and 22000),
  state       text not null default 'ready' check (state in ('ready', 'asked', 'open')),
  asked_at    timestamptz,
  opens_at    timestamptz,
  refused_at  timestamptz,
  opened_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (owner_id <> trusted_id),
  check ((state = 'ready') = (opens_at is null))
);
create index vault_emergencies_trusted on vault_emergencies (trusted_id);
create index vault_emergencies_due on vault_emergencies (opens_at) where state = 'asked';

-- The escrow: for each item that opens, its key wrapped for the trusted person.
create table vault_emergency_items (
  emergency_id  uuid not null references vault_emergencies(id) on delete cascade,
  thing_id      uuid not null references vault_items(thing_id) on delete cascade,
  wrapped_key   text not null check (char_length(wrapped_key) between 1 and 512),
  handed_at     timestamptz,
  primary key (emergency_id, thing_id)
);
create index vault_emergency_items_thing on vault_emergency_items (thing_id);

-- Helpers: people who said yes to helping someone back into their Vault. Each holds one share of the Vault
-- key, sealed to their own public key; any two shares rebuild it. The API hands a share to its helper only
-- while a recovery its owner started is open.
create table vault_helpers (
  id            uuid primary key,
  owner_id      uuid not null references profiles(id) on delete cascade,
  helper_id     uuid not null references profiles(id) on delete cascade,
  state         text not null default 'asked' check (state in ('asked', 'accepted', 'declined')),
  sealed_share  text check (char_length(sealed_share) between 1 and 512),
  asked_at      timestamptz not null default now(),
  answered_at   timestamptz,
  client_id     uuid,
  unique (owner_id, helper_id),
  unique (owner_id, client_id),
  check (owner_id <> helper_id),
  check (sealed_share is null or state = 'accepted')
);
create index vault_helpers_helper on vault_helpers (helper_id);

-- Getting back in on a new phone without the Vault key. The new phone makes a temporary key pair; each
-- helper's phone opens its share and seals it again to that temporary public key.
create table vault_recoveries (
  id               uuid primary key,
  owner_id         uuid not null references profiles(id) on delete cascade,
  temp_public_key  text not null check (char_length(temp_public_key) = 43),
  state            text not null default 'open' check (state in ('open', 'done', 'cancelled', 'lapsed')),
  started_at       timestamptz not null default now(),
  lapses_at        timestamptz not null,
  ended_at         timestamptz,
  client_id        uuid,
  unique (owner_id, client_id)
);
-- Only one can be open for a person.
create unique index vault_recoveries_one_open on vault_recoveries (owner_id) where state = 'open';
create index vault_recoveries_owner on vault_recoveries (owner_id, started_at desc);
create index vault_recoveries_due on vault_recoveries (lapses_at) where state = 'open';

create table vault_recovery_shares (
  recovery_id     uuid not null references vault_recoveries(id) on delete cascade,
  helper_id       uuid not null references profiles(id) on delete cascade,
  resealed_share  text not null check (char_length(resealed_share) between 1 and 512),
  given_at        timestamptz not null default now(),
  primary key (recovery_id, helper_id)
);
create index vault_recovery_shares_helper on vault_recovery_shares (helper_id);

-- What the Vault has to tell someone at once (someone asked for your Vault, a recovery was started): written
-- in the same transaction as the reason for it, pushed to the person's phones by a job a few seconds later.
create table vault_notices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  kind         text not null,
  title        text not null,
  body         text not null,
  url          text not null,
  created_at   timestamptz not null default now(),
  attempts     integer not null default 0,
  next_try_at  timestamptz not null default now(),
  sent_at      timestamptz
);
create index vault_notices_due on vault_notices (next_try_at) where sent_at is null;
create index vault_notices_user on vault_notices (user_id, created_at desc);

-- A guest has no account and no key. A pass can carry sealed cards: a door code or a Wi‑Fi password, sealed
-- by the phone of whoever made the pass with a key that travels only in the part of the link after the #,
-- which browsers never send to a server. A show-once card loses its ciphertext when the guest's page says
-- it was shown.
create table guest_pass_cards (
  id          uuid primary key,
  pass_id     uuid not null references guest_passes(id) on delete cascade,
  label       text not null check (char_length(label) between 1 and 60),
  ciphertext  text check (char_length(ciphertext) between 1 and 4096),
  once        boolean not null default false,
  shown_at    timestamptz,
  -- The Vault item it was made from, so the pass doesn't list that item a second time.
  thing_id    uuid references things(id) on delete set null,
  client_id   uuid,
  -- The order they were added in, also for cards made in the same moment.
  seq         bigint generated always as identity,
  created_at  timestamptz not null default now(),
  unique (pass_id, client_id)
);
create index guest_pass_cards_pass on guest_pass_cards (pass_id, seq);
create index guest_pass_cards_thing on guest_pass_cards (thing_id) where thing_id is not null;

-- The pass's key, sealed to the Vault of whoever made the pass, so their other phone can build the full link
-- again. The API can't open it.
alter table guest_passes add column key_for_maker text check (char_length(key_for_maker) between 1 and 512);
