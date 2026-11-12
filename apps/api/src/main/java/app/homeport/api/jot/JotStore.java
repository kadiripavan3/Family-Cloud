package app.homeport.api.jot;

import app.homeport.api.common.Keyset;
import app.homeport.api.common.Rules;
import app.homeport.api.common.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Reads and writes what was jotted, the ways in a person switched on, and where their jots go. A jot is its
 * writer's own: nobody else reads it. What it made (an event, a line on a list) is shared like any other thing.
 */
@Repository
public class JotStore {

    /** One thing a jotted line became. */
    public record JotRow(
            UUID id,
            UUID circleId,
            UUID memberId,
            UUID batchId,
            int position,
            JotSource source,
            String words,
            ReadAs became,
            String title,
            UUID thingId,
            UUID itemId,
            int moves,
            Instant createdAt) {}

    /** The ways in a person switched on. */
    public record WaysRow(boolean pinnedNote, boolean voice, boolean share, TimedAs timedAs, CodesGo codes) {

        /** What a person has before they change anything. */
        static final WaysRow START = new WaysRow(false, true, true, TimedAs.REMINDER, CodesGo.ASK);
    }

    /** What a person chose in one circle: where their shopping goes, and the list they are using now. */
    public record PlacesRow(UUID buyListId, UUID inUseListId, Instant inUseSince) {}

    /** A list someone in the circle is using now. */
    public record InUse(UUID listId, UUID memberId, Instant since) {}

    private final JdbcClient jdbc;

    JotStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static JotRow row(ResultSet rs, int n) throws SQLException {
        return new JotRow(
                rs.getObject("id", UUID.class),
                rs.getObject("circle_id", UUID.class),
                rs.getObject("member_id", UUID.class),
                rs.getObject("batch_id", UUID.class),
                rs.getInt("position"),
                JotSource.read(rs.getString("source")),
                rs.getString("words"),
                ReadAs.read(rs.getString("became")),
                rs.getString("title"),
                rs.getObject("thing_id", UUID.class),
                rs.getObject("item_id", UUID.class),
                rs.getInt("moves"),
                Sql.instant(rs, "created_at"));
    }

    // ---------- jots ----------

    public UUID insert(
            UUID circleId,
            UUID memberId,
            UUID batchId,
            int position,
            JotSource source,
            String words,
            ReadAs became,
            String title,
            UUID thingId,
            UUID itemId) {
        UUID id = UUID.randomUUID();
        jdbc.sql("""
            insert into jots (id, circle_id, member_id, batch_id, position, source, words, became, title, thing_id, item_id)
            values (:id, :circle, :member, :batch, :position, :source, :words, :became, :title, :thing, :item)
            """)
                .param("id", id)
                .param("circle", circleId)
                .param("member", memberId)
                .param("batch", batchId)
                .param("position", position)
                .param("source", source.code())
                .param("words", words)
                .param("became", became.code())
                .param("title", title)
                .param("thing", thingId)
                .param("item", itemId)
                .update();
        return id;
    }

    /** What one jotted line became, in the order it was said. Empty when that line hasn't been filed. */
    public List<JotRow> batch(UUID memberId, UUID batchId) {
        return jdbc.sql("select * from jots where member_id = :member and batch_id = :batch order by position")
                .param("member", memberId)
                .param("batch", batchId)
                .query(JotStore::row)
                .list();
    }

    /** A jot, for the person who jotted it. To everyone else it isn't there. */
    public Optional<JotRow> find(UUID id, UUID me) {
        return jdbc.sql("""
            select j.* from jots j join members m on m.id = j.member_id and m.user_id = :me and m.status = 'joined'
            where j.id = :id
            """)
                .param("id", id)
                .param("me", me)
                .query(JotStore::row)
                .optional();
    }

    /** What a person jotted in a circle, the latest first, a page at a time. */
    public List<JotRow> of(UUID memberId, Keyset page) {
        return jdbc.sql("""
            select * from jots where member_id = :member
              and (cast(:at as timestamptz) is null or (created_at, id) < (cast(:at as timestamptz), cast(:id as uuid)))
            order by created_at desc, id desc limit :limit
            """)
                .param("member", memberId)
                .param("at", page.first() ? null : Sql.timestamp(page.instant(0)))
                .param("id", page.first() ? null : page.uuid(1).toString())
                .param("limit", page.fetch())
                .query(JotStore::row)
                .list();
    }

    public void delete(UUID id) {
        jdbc.sql("delete from jots where id = :id").param("id", id).update();
    }

    /** Writes what a jot became after it was moved. */
    public void moved(UUID id, ReadAs became, String title, UUID thingId, UUID itemId) {
        jdbc.sql("""
            update jots set became = :became, title = :title, thing_id = :thing, item_id = :item, moves = moves + 1
            where id = :id
            """)
                .param("id", id)
                .param("became", became.code())
                .param("title", title)
                .param("thing", thingId)
                .param("item", itemId)
                .update();
    }

    public int countSince(UUID memberId, Instant since) {
        return jdbc.sql("select count(*) from jots where member_id = :member and created_at >= :since")
                .param("member", memberId)
                .param("since", Sql.timestamp(since))
                .query(Integer.class)
                .single();
    }

    /**
     * What a circle put on lists most in the last weeks, as far as the viewer may see those lists: the chips
     * a widget offers for one-tap adding. As it was last written ("Oat milk"), most often first.
     */
    public List<String> mostAdded(UUID circleId, UUID me, int weeks, int limit) {
        return jdbc.sql("""
            select (array_agg(j.title order by j.created_at desc))[1] as title
            from jots j join things t on t.id = j.thing_id
            where j.circle_id = :circle and j.became = 'list_item' and j.created_at > now() - make_interval(weeks => :weeks)
              and\s""" + Rules.sees("t", ":me") + """
             group by lower(j.title) order by count(*) desc, max(j.created_at) desc, lower(j.title) limit :limit
            """)
                .param("circle", circleId)
                .param("me", me)
                .param("weeks", weeks)
                .param("limit", limit)
                .query(String.class)
                .list();
    }

    // ---------- ways in ----------

    public WaysRow ways(UUID userId) {
        return jdbc.sql("select * from jot_ways where user_id = :user")
                .param("user", userId)
                .query((rs, n) -> new WaysRow(
                        rs.getBoolean("pinned_note"),
                        rs.getBoolean("voice"),
                        rs.getBoolean("share"),
                        TimedAs.read(rs.getString("timed_as")),
                        CodesGo.read(rs.getString("codes"))))
                .optional()
                .orElse(WaysRow.START);
    }

    public void saveWays(UUID userId, WaysRow ways) {
        jdbc.sql("""
            insert into jot_ways (user_id, pinned_note, voice, share, timed_as, codes)
            values (:user, :pinned, :voice, :share, :timed, :codes)
            on conflict (user_id) do update set pinned_note = excluded.pinned_note, voice = excluded.voice,
              share = excluded.share, timed_as = excluded.timed_as, codes = excluded.codes, updated_at = now()
            """)
                .param("user", userId)
                .param("pinned", ways.pinnedNote())
                .param("voice", ways.voice())
                .param("share", ways.share())
                .param("timed", ways.timedAs().code())
                .param("codes", ways.codes().code())
                .update();
    }

    public PlacesRow places(UUID memberId) {
        return jdbc.sql("select * from jot_places where member_id = :member")
                .param("member", memberId)
                .query((rs, n) -> new PlacesRow(
                        rs.getObject("buy_list_id", UUID.class),
                        rs.getObject("in_use_list_id", UUID.class),
                        Sql.instant(rs, "in_use_since")))
                .optional()
                .orElse(new PlacesRow(null, null, null));
    }

    /** Says which list a person's shopping goes to in this circle; null for the circle's own. */
    public void buyList(UUID memberId, UUID listId) {
        jdbc.sql("""
            insert into jot_places (member_id, buy_list_id) values (:member, :list)
            on conflict (member_id) do update set buy_list_id = excluded.buy_list_id
            """).param("member", memberId).param("list", listId).update();
    }

    /** Says which list a person is using right now; null for none. */
    public void use(UUID memberId, UUID listId) {
        jdbc.sql("""
            insert into jot_places (member_id, in_use_list_id, in_use_since)
            values (:member, :list, case when cast(:list as uuid) is null then null else now() end)
            on conflict (member_id) do update set in_use_list_id = excluded.in_use_list_id,
              in_use_since = excluded.in_use_since
            """).param("member", memberId).param("list", listId).update();
    }

    /**
     * The list in use in a circle right now, among the ones the viewer may see: their own first, else the
     * one someone else began using last. A list counts as in use for eight hours.
     */
    public Optional<InUse> inUseIn(UUID circleId, UUID me) {
        return jdbc.sql("""
            select p.in_use_list_id, p.member_id, p.in_use_since
            from jot_places p join members m on m.id = p.member_id and m.status <> 'left'
            join things t on t.id = p.in_use_list_id
            where m.circle_id = :circle and p.in_use_since > now() - interval '8 hours'
              and\s""" + Rules.sees("t", ":me") + """
             order by (m.user_id is not distinct from :me) desc, p.in_use_since desc limit 1
            """)
                .param("circle", circleId)
                .param("me", me)
                .query((rs, n) -> new InUse(
                        rs.getObject("in_use_list_id", UUID.class),
                        rs.getObject("member_id", UUID.class),
                        Sql.instant(rs, "in_use_since")))
                .optional();
    }

    // ---------- the circle's shopping list ----------

    public Optional<UUID> shoppingList(UUID circleId) {
        return jdbc.sql("select list_id from shopping_lists where circle_id = :circle")
                .param("circle", circleId)
                .query(UUID.class)
                .optional();
    }

    public void markShoppingList(UUID circleId, UUID listId, UUID memberId) {
        jdbc.sql("""
            insert into shopping_lists (circle_id, list_id, marked_by) values (:circle, :list, :member)
            on conflict (circle_id) do update set list_id = excluded.list_id, marked_by = excluded.marked_by,
              marked_at = now()
            """)
                .param("circle", circleId)
                .param("list", listId)
                .param("member", memberId)
                .update();
    }
}
