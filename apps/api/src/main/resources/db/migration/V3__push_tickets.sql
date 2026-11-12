-- What the push service hands back for each push it accepted. It is asked a while later what became of them,
-- so a phone whose app was removed is taken off the list (see DeviceStore).
create table push_tickets (
  id          text primary key,
  token       text not null,
  created_at  timestamptz not null default now()
);
create index push_tickets_age on push_tickets (created_at);
