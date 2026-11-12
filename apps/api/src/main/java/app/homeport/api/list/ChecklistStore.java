package app.homeport.api.list;

import app.homeport.api.common.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes checklists and their lines. Who may read one is decided by the thing it is. */
@Repository
public class ChecklistStore {

    public record ItemRow(
            UUID id,
            UUID listId,
            String text,
            String note,
            String section,
            Long amountCents,
            double position,
            Instant doneAt,
            UUID doneBy,
            UUID assignedTo,
            UUID addedBy) {}

    public record Tally(int left, int done) {}

    private final JdbcClient jdbc;

    ChecklistStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static ItemRow row(ResultSet rs, int n) throws SQLException {
        return new ItemRow(
                rs.getObject("id", UUID.class),
                rs.getObject("thing_id", UUID.class),
                rs.getString("text"),
                rs.getString("note"),
                rs.getString("section"),
                (Long) rs.getObject("amount_cents"),
                rs.getDouble("position"),
                Sql.instant(rs, "done_at"),
                rs.getObject("done_by", UUID.class),
                rs.getObject("assigned_to", UUID.class),
                rs.getObject("added_by", UUID.class));
    }

    public void insert(UUID thingId) {
        jdbc.sql("insert into checklists (thing_id) values (:id) on conflict do nothing")
                .param("id", thingId)
                .update();
    }

    public boolean exists(UUID thingId) {
        return jdbc.sql("select exists (select 1 from checklists where thing_id = :id)")
                .param("id", thingId)
                .query(Boolean.class)
                .single();
    }

    /** The lines of a list, in their order. A list holds 500 at most. */
    public List<ItemRow> items(UUID listId) {
        return jdbc.sql("select * from checklist_items where thing_id = :id order by position, id limit 500")
                .param("id", listId)
                .query(ChecklistStore::row)
                .list();
    }

    public Optional<ItemRow> item(UUID itemId) {
        return jdbc.sql("select * from checklist_items where id = :id")
                .param("id", itemId)
                .query(ChecklistStore::row)
                .optional();
    }

    public int count(UUID listId) {
        return jdbc.sql("select count(*) from checklist_items where thing_id = :id")
                .param("id", listId)
                .query(Integer.class)
                .single();
    }

    /** Adds a line at the end. Sending the same clientId again adds nothing and returns the line added the first time. */
    public UUID add(
            UUID listId,
            String text,
            String note,
            String section,
            Long amountCents,
            UUID assignedTo,
            UUID addedBy,
            UUID clientId) {
        return jdbc.sql("""
            insert into checklist_items (id, thing_id, text, note, section, amount_cents, assigned_to, added_by, client_id, position)
            values (:id, :list, :text, :note, :section, :amount, :assigned, :by, :client,
              coalesce((select max(position) from checklist_items where thing_id = :list), 0) + 1)
            on conflict (thing_id, client_id) do update set client_id = excluded.client_id
            returning id
            """)
                .param("id", UUID.randomUUID())
                .param("list", listId)
                .param("text", text)
                .param("note", note)
                .param("section", section)
                .param("amount", amountCents)
                .param("assigned", assignedTo)
                .param("by", addedBy)
                .param("client", clientId)
                .query(UUID.class)
                .single();
    }

    public void change(UUID itemId, String text, String note, String section, Long amountCents, UUID assignedTo) {
        jdbc.sql("""
            update checklist_items set text = :text, note = :note, section = :section, amount_cents = :amount,
              assigned_to = :assigned where id = :id
            """)
                .param("id", itemId)
                .param("text", text)
                .param("note", note)
                .param("section", section)
                .param("amount", amountCents)
                .param("assigned", assignedTo)
                .update();
    }

    /** Ticks a line, or takes the tick away. Ticking what is ticked keeps who ticked it first. */
    public void tick(UUID itemId, boolean done, UUID by) {
        if (done) {
            jdbc.sql("update checklist_items set done_at = now(), done_by = :by where id = :id and done_at is null")
                    .param("id", itemId)
                    .param("by", by)
                    .update();
        } else {
            jdbc.sql("update checklist_items set done_at = null, done_by = null where id = :id")
                    .param("id", itemId)
                    .update();
        }
    }

    /** Moves a line to just before another one of the same list, or to the end when there is no other. */
    public void move(UUID itemId, UUID listId, UUID beforeId) {
        jdbc.sql("""
            update checklist_items set position = case
              when cast(:before as uuid) is null then coalesce((select max(position) from checklist_items where thing_id = :list), 0) + 1
              else (select (b.position + coalesce((select max(p.position) from checklist_items p
                                                  where p.thing_id = :list and p.position < b.position and p.id <> :id), b.position - 1)) / 2
                    from checklist_items b where b.id = cast(:before as uuid) and b.thing_id = :list)
              end
            where id = :id
            """)
                .param("id", itemId)
                .param("list", listId)
                .param("before", beforeId == null ? null : beforeId.toString())
                .update();
    }

    public void delete(UUID itemId) {
        jdbc.sql("delete from checklist_items where id = :id")
                .param("id", itemId)
                .update();
    }

    /** Clears the ticked lines of a list. Returns how many went. */
    public int clearDone(UUID listId) {
        return jdbc.sql("delete from checklist_items where thing_id = :id and done_at is not null")
                .param("id", listId)
                .update();
    }

    /** How many lines of each list are left and done. */
    public Map<UUID, Tally> tallies(List<UUID> listIds) {
        if (listIds.isEmpty()) {
            return Map.of();
        }
        record Row(UUID id, int left, int done) {}
        return jdbc
                .sql("""
            select thing_id, count(*) filter (where done_at is null) as left_n, count(*) filter (where done_at is not null) as done_n
            from checklist_items where thing_id in (:ids) group by thing_id
            """)
                .param("ids", listIds)
                .query((rs, n) ->
                        new Row(rs.getObject("thing_id", UUID.class), rs.getInt("left_n"), rs.getInt("done_n")))
                .list()
                .stream()
                .collect(Collectors.toMap(Row::id, r -> new Tally(r.left(), r.done())));
    }
}
