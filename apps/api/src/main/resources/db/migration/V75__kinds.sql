-- When someone left a circle. A flat's roll ("Everyone who's lived here") says from when to when each person
-- lived there, and until now only the fact that someone had left was kept, not the day.
--
-- It is stamped here, whoever marks them as gone (they left, were removed, or deleted their account), and
-- cleared again if they come back.
alter table members add column left_at timestamptz;

create function member_left_at() returns trigger language plpgsql as $$
begin
  if new.status = 'left' and old.status is distinct from 'left' then
    new.left_at := now();
  elsif new.status is distinct from 'left' then
    new.left_at := null;
  end if;
  return new;
end $$;
create trigger members_left_at before update of status on members
  for each row execute function member_left_at();
