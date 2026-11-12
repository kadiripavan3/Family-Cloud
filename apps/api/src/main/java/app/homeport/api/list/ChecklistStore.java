package app.homeport.api.list;

import app.homeport.api.common.Rules;
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

/**
 * Reads and writes checklists and their lines. Who may read a list is decided by the thing it is. A line has
 * one small rule of its own on top: it can be kept from someone ({@link #shownTo}), and then it isn't there
 * for them, wherever lines are read for a person.
 */
@Repository
public class ChecklistStore {

    /** How long after ticking or adding a line someone still counts as being in the list. */
    static final String HERE_FOR = "interval '10 minutes'";

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
            UUID addedBy,
            Repeats repeats,
            Instant createdAt) {}

    public record Tally(int left, int done) {}

    /** What a list keeps besides its lines. */
    public record ListRow(
            String emoji, String currency, boolean aisles, long version, UUID editedBy, Instant editedAt) {}

    /** Someone a line is kept from. */
    public record HideRow(UUID itemId, UUID memberId, String name) {}

    /** What someone did in a list a moment ago. */
    public record HandRow(UUID listId, UUID memberId, Did did, Instant at) {}

    public record UsualRow(String text, String section) {}

    private final JdbcClient jdbc;

    ChecklistStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * True for a line this viewer may read: it isn't kept from them.
     *
     * @param item the alias of checklist_items in the query
     * @param viewer the parameter holding the viewer's user id, such as {@code ":me"}
     */
    static String shownTo(String item, String viewer) {
        return ("not exists (select 1 from checklist_item_hides ih join members hm on hm.id = ih.member_id"
                        + " where ih.item_id = %s.id and hm.user_id = %s)")
                .formatted(item, viewer);
    }

    /** True for a line that is kept from nobody: what a guest reads, and what a search looks through. */
    static String shownToAll(String item) {
        return "not exists (select 1 from checklist_item_hides ih where ih.item_id = %s.id)".formatted(item);
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
                rs.getObject("added_by", UUID.class),
                Repeats.read(rs.getString("repeats")),
                Sql.instant(rs, "created_at"));
    }

    // ---------- the list ----------

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

    public ListRow details(UUID listId) {
        return jdbc.sql(
                        "select emoji, currency, aisles, version, edited_by, edited_at from checklists where thing_id = :id")
                .param("id", listId)
                .query((rs, n) -> new ListRow(
                        rs.getString("emoji"),
                        rs.getString("currency"),
                        rs.getBoolean("aisles"),
                        rs.getLong("version"),
                        rs.getObject("edited_by", UUID.class),
                        Sql.instant(rs, "edited_at")))
                .single();
    }

    public void setDetails(UUID listId, String emoji, String currency, boolean aisles) {
        jdbc.sql("update checklists set emoji = :emoji, currency = :currency, aisles = :aisles where thing_id = :id")
                .param("id", listId)
                .param("emoji", emoji)
                .param("currency", currency)
                .param("aisles", aisles)
                .update();
    }

    /** Writes down that a list changed, and who did it (nobody, when it changed by itself): its version goes up by one. */
    public void changed(UUID listId, UUID by) {
        jdbc.sql("""
            update checklists set version = version + 1, edited_by = coalesce(cast(:by as uuid), edited_by),
              edited_at = case when cast(:by as uuid) is null then edited_at else now() end
            where thing_id = :id
            """)
                .param("id", listId)
                .param("by", by == null ? null : by.toString())
                .update();
    }

    /**
     * Where a list stands for one viewer, as a short text that changes whenever anything they would be shown
     * changes: a line, the title, who sees it, who is in it right now, where it is filed, their own way of
     * looking at it. Empty when they may not see the list. One small question to the database, so a phone
     * can ask every few seconds.
     */
    public Optional<String> state(UUID listId, UUID me) {
        return jdbc.sql("""
            select c.version || '.' || (extract(epoch from t.updated_at) * 1000000)::bigint
              || '.' || (select count(*) from checklist_people h where h.thing_id = c.thing_id
                           and h.did_at > now() -\s""" + HERE_FOR + """
            )
              || '.' || coalesce((select extract(epoch from f.filed_at)::bigint from filed f where f.thing_id = c.thing_id), 0)
              || '.' || coalesce((select case when v.show_ticked then 1 else 0 end from checklist_people v
                                  join members sm on sm.id = v.member_id
                                  where v.thing_id = c.thing_id and sm.user_id = :me), 1)
              || '.' || (select count(*) from note_pins np join members pm on pm.id = np.member_id
                         where np.thing_id = c.thing_id and pm.user_id = :me)
            from checklists c join things t on t.id = c.thing_id
            where c.thing_id = :id and\s""" + Rules.sees("t", ":me"))
                .param("id", listId)
                .param("me", me)
                .query(String.class)
                .optional();
    }

    // ---------- lines ----------

    /** Every line of a list, in order, whoever it is kept from. A list holds 500 at most. */
    public List<ItemRow> items(UUID listId) {
        return jdbc.sql("select * from checklist_items where thing_id = :id order by position, id limit 500")
                .param("id", listId)
                .query(ChecklistStore::row)
                .list();
    }

    /** The lines of a list this viewer may read, in order. */
    public List<ItemRow> items(UUID listId, UUID me) {
        return jdbc.sql("select i.* from checklist_items i where i.thing_id = :id and " + shownTo("i", ":me")
                        + " order by i.position, i.id limit 500")
                .param("id", listId)
                .param("me", me)
                .query(ChecklistStore::row)
                .list();
    }

    /** The lines of a list that are kept from nobody: what a guest is shown. */
    public List<ItemRow> itemsForAll(UUID listId) {
        return jdbc.sql("select i.* from checklist_items i where i.thing_id = :id and " + shownToAll("i")
                        + " order by i.position, i.id limit 500")
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

    /** A line, unless it is kept from this viewer. */
    public Optional<ItemRow> item(UUID itemId, UUID me) {
        return jdbc.sql("select i.* from checklist_items i where i.id = :id and " + shownTo("i", ":me"))
                .param("id", itemId)
                .param("me", me)
                .query(ChecklistStore::row)
                .optional();
    }

    /** The line that was added with this clientId, when it was sent before. */
    public Optional<ItemRow> sentBefore(UUID listId, UUID clientId) {
        return jdbc.sql("select * from checklist_items where thing_id = :list and client_id = :client")
                .param("list", listId)
                .param("client", clientId)
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
        return add(listId, text, note, section, amountCents, assignedTo, addedBy, clientId, null);
    }

    public UUID add(
            UUID listId,
            String text,
            String note,
            String section,
            Long amountCents,
            UUID assignedTo,
            UUID addedBy,
            UUID clientId,
            Repeats repeats) {
        return jdbc.sql("""
            insert into checklist_items (id, thing_id, text, note, section, amount_cents, assigned_to, added_by, client_id,
              repeats, position)
            values (:id, :list, :text, :note, :section, :amount, :assigned, :by, :client, :repeats,
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
                .param("repeats", repeats == null ? null : repeats.code())
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

    public void setRepeats(UUID itemId, Repeats repeats) {
        jdbc.sql("update checklist_items set repeats = :repeats where id = :id")
                .param("id", itemId)
                .param("repeats", repeats == null ? null : repeats.code())
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

    /**
     * Clears the ticked lines of a list that this viewer can see. A line that repeats stays: it comes back by
     * itself. Returns how many went.
     */
    public int clearDone(UUID listId, UUID me) {
        return jdbc.sql("delete from checklist_items i where i.thing_id = :id and i.done_at is not null"
                        + " and i.repeats is null and " + shownTo("i", ":me"))
                .param("id", listId)
                .param("me", me)
                .update();
    }

    /**
     * Unticks every repeating line whose time has come round: six days after a weekly line was ticked (in time
     * for the same day next week), four weeks less a day after a monthly one. Returns the lists it changed.
     */
    public List<UUID> bringBack() {
        return jdbc.sql("""
            update checklist_items set done_at = null, done_by = null
            where repeats is not null and done_at is not null
              and done_at < now() - case repeats when 'weekly' then interval '6 days' else interval '27 days' end
            returning thing_id
            """).query(UUID.class).list().stream().distinct().toList();
    }

    /** How many lines of each list are left and done, counting every line. */
    public Map<UUID, Tally> tallies(List<UUID> listIds) {
        return tallies(listIds, null);
    }

    /** How many lines of each list are left and done, counting only the lines this viewer may read. */
    public Map<UUID, Tally> tallies(List<UUID> listIds, UUID me) {
        if (listIds.isEmpty()) {
            return Map.of();
        }
        record Row(UUID id, int left, int done) {}
        var query = jdbc.sql("""
            select i.thing_id, count(*) filter (where i.done_at is null) as left_n,
                   count(*) filter (where i.done_at is not null) as done_n
            from checklist_items i where i.thing_id in (:ids)\s""" + (me == null ? "" : "and " + shownTo("i", ":me")) + " group by i.thing_id")
                .param("ids", listIds);
        if (me != null) {
            query = query.param("me", me);
        }
        return query
                .query((rs, n) ->
                        new Row(rs.getObject("thing_id", UUID.class), rs.getInt("left_n"), rs.getInt("done_n")))
                .list()
                .stream()
                .collect(Collectors.toMap(Row::id, r -> new Tally(r.left(), r.done())));
    }

    // ---------- a line kept from someone ----------

    /** Who the lines of a list are kept from, by line. */
    public Map<UUID, List<HideRow>> hides(UUID listId) {
        return jdbc
                .sql("""
            select ih.item_id, ih.member_id, m.name from checklist_item_hides ih
            join checklist_items i on i.id = ih.item_id join members m on m.id = ih.member_id and m.status <> 'left'
            where i.thing_id = :list order by m.created_at, m.id
            """)
                .param("list", listId)
                .query((rs, n) -> new HideRow(
                        rs.getObject("item_id", UUID.class),
                        rs.getObject("member_id", UUID.class),
                        rs.getString("name")))
                .list()
                .stream()
                .collect(Collectors.groupingBy(HideRow::itemId));
    }

    public void setHides(UUID itemId, List<UUID> memberIds) {
        jdbc.sql("delete from checklist_item_hides where item_id = :item")
                .param("item", itemId)
                .update();
        for (UUID member : memberIds) {
            jdbc.sql(
                            "insert into checklist_item_hides (item_id, member_id) values (:item, :member) on conflict do nothing")
                    .param("item", itemId)
                    .param("member", member)
                    .update();
        }
    }

    // ---------- one person and one list ----------

    /** Writes down what someone just did in a list, so the others see them there for a while. */
    public void did(UUID listId, UUID memberId, Did did) {
        jdbc.sql("""
            insert into checklist_people (thing_id, member_id, did, did_at) values (:list, :member, :did, now())
            on conflict (thing_id, member_id) do update set did = excluded.did, did_at = excluded.did_at
            """)
                .param("list", listId)
                .param("member", memberId)
                .param("did", did.code())
                .update();
    }

    /** Who ticked or added something in these lists in the last ten minutes, the latest first. */
    public List<HandRow> hands(List<UUID> listIds) {
        if (listIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("select thing_id, member_id, did, did_at from checklist_people where thing_id in (:ids)"
                        + " and did_at > now() - " + HERE_FOR + " order by did_at desc, member_id")
                .param("ids", listIds)
                .query((rs, n) -> new HandRow(
                        rs.getObject("thing_id", UUID.class),
                        rs.getObject("member_id", UUID.class),
                        Did.read(rs.getString("did")),
                        Sql.instant(rs, "did_at")))
                .list();
    }

    public boolean showsTicked(UUID listId, UUID memberId) {
        return jdbc.sql("select show_ticked from checklist_people where thing_id = :list and member_id = :member")
                .param("list", listId)
                .param("member", memberId)
                .query(Boolean.class)
                .optional()
                .orElse(true);
    }

    public void setShowTicked(UUID listId, UUID memberId, boolean show) {
        jdbc.sql("""
            insert into checklist_people (thing_id, member_id, show_ticked) values (:list, :member, :show)
            on conflict (thing_id, member_id) do update set show_ticked = excluded.show_ticked
            """)
                .param("list", listId)
                .param("member", memberId)
                .param("show", show)
                .update();
    }

    // ---------- what a list has held before ----------

    /** Counts a line a list was given, under the heading it went under. */
    public void used(UUID listId, String key, String text, String section) {
        jdbc.sql("""
            insert into checklist_usuals (thing_id, key, text, section) values (:list, :key, :text, :section)
            on conflict (thing_id, key) do update set times = checklist_usuals.times + 1, text = excluded.text,
              section = excluded.section, last_at = now()
            """)
                .param("list", listId)
                .param("key", key)
                .param("text", text)
                .param("section", section)
                .update();
    }

    /** A line was put under another heading: next time it goes there by itself. */
    public void usualGoesUnder(UUID listId, String key, String section) {
        jdbc.sql("update checklist_usuals set section = :section where thing_id = :list and key = :key")
                .param("list", listId)
                .param("key", key)
                .param("section", section)
                .update();
    }

    public void forget(UUID listId, String key) {
        jdbc.sql("delete from checklist_usuals where thing_id = :list and key = :key")
                .param("list", listId)
                .param("key", key)
                .update();
    }

    /** The heading this line went under the last time it was on this list. */
    public Optional<String> usualSection(UUID listId, String key) {
        return jdbc.sql("select section from checklist_usuals where thing_id = :list and key = :key")
                .param("list", listId)
                .param("key", key)
                .query(String.class)
                .optional();
    }

    /** What this list held most often before and doesn't hold now. */
    public List<UsualRow> usuals(UUID listId, int limit) {
        return jdbc.sql("""
            select u.text, u.section from checklist_usuals u
            where u.thing_id = :list
              and not exists (select 1 from checklist_items i where i.thing_id = u.thing_id and lower(i.text) = u.key)
            order by u.times desc, u.last_at desc, u.key limit :limit
            """)
                .param("list", listId)
                .param("limit", limit)
                .query((rs, n) -> new UsualRow(rs.getString("text"), rs.getString("section")))
                .list();
    }

    /** Keeps what a list remembers to the 300 lines it was given most often. */
    public void forgetTheRarest(UUID listId) {
        jdbc.sql("""
            delete from checklist_usuals where thing_id = :list and key in (
              select key from checklist_usuals where thing_id = :list order by times desc, last_at desc, key offset 300)
            """).param("list", listId).update();
    }
}
