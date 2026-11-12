-- When a circle goes (its last person left, or deleted their account), its things go first.
--
-- Without this, the database deletes the circle's members and its things side by side. A line of a list that
-- someone ticked points at that member ("ticked by") and at its list: the pointer to the member is cleared
-- in the same breath as the list is deleted, the database re-checks the half-deleted line, finds its list
-- gone, and refuses the whole delete. The same would happen to every table that belongs to a thing and
-- remembers a member. With the things gone first there is nothing left to clear.
create function delete_circle_things_first() returns trigger language plpgsql as $$
begin
  delete from things where circle_id = old.id;
  return old;
end $$;

create trigger circles_things_first before delete on circles
  for each row execute function delete_circle_things_first();
