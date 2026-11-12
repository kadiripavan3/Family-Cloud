package app.homeport.api.notes;

import app.homeport.api.common.Keyset;
import app.homeport.api.common.Rules;
import app.homeport.api.common.Sql;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Reads what the Notes screens list: what is in a folder, what isn't filed, what changed lately, what someone
 * pinned. Every list is of things, read with the one rule about who may see a thing; a folder never adds to
 * it or takes from it.
 */
@Repository
class NotesStore {

    /** A thing in a folder, with where it stands there. */
    record Filed(ThingRow thing, double position) {}

    /** What Notes keeps about a thing besides what every thing has: its emoji, and who changed it last. */
    record Extra(String emoji, UUID editedBy, Instant editedAt) {}

    /** True when the thing is in a folder this viewer may see. In any other case it isn't filed, for them. */
    private static final String FILED_FOR_ME = "exists (select 1 from filed fd join things fp on fp.id = fd.folder_id"
            + " where fd.thing_id = t.id and " + Rules.sees("fp", ":me") + ")";

    /** True for a list that is drawn in a page this viewer may see: it has its place there. */
    private static final String IN_A_PAGE_FOR_ME =
            "exists (select 1 from page_blocks pb join things pt on pt.id = pb.page_id"
                    + " where pb.thing_id = t.id and pb.kind = 'checklist' and " + Rules.sees("pt", ":me") + ")";

    private static final String PAGES_AND_LISTS = " t.place = 'notes' and t.kind <> 'folder' ";

    private final JdbcClient jdbc;

    NotesStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** What is in a folder that the viewer may see, in the order people gave it, a page at a time. */
    List<Filed> children(UUID folderId, UUID me, Keyset page) {
        Double after = page.first() ? null : number(page.text(0));
        return jdbc.sql("select " + ThingStore.COLUMNS + """
            , f.position from filed f join things t on t.id = f.thing_id
            where f.folder_id = :folder
              and (cast(:after as double precision) is null
                   or (f.position, f.thing_id) > (cast(:after as double precision), cast(:id as uuid)))
              and\s""" + Rules.sees("t", ":me")
                        + " order by f.position, f.thing_id limit :limit")
                .param("folder", folderId)
                .param("me", me)
                .param("after", after)
                .param("id", page.first() ? null : page.uuid(1).toString())
                .param("limit", page.fetch())
                .query((rs, n) -> new Filed(ThingStore.row(rs, n), rs.getDouble("position")))
                .list();
    }

    private static Double number(String text) {
        try {
            return Double.valueOf(text);
        } catch (NumberFormatException notANumber) {
            throw Keyset.badCursor();
        }
    }

    /**
     * The pages and lists of a circle that aren't filed, for this viewer: in no folder, or in one they may
     * not see. A list drawn in a page they may see has its place there and isn't listed. Last changed first.
     */
    List<ThingRow> unfiled(UUID circleId, UUID me, Keyset page) {
        return jdbc.sql("select " + ThingStore.COLUMNS + " from things t where t.circle_id = :circle and"
                        + PAGES_AND_LISTS + "and not " + FILED_FOR_ME + " and not " + IN_A_PAGE_FOR_ME
                        + " and (cast(:at as timestamptz) is null"
                        + " or (t.updated_at, t.id) < (cast(:at as timestamptz), cast(:id as uuid))) and "
                        + Rules.sees("t", ":me") + " order by t.updated_at desc, t.id desc limit :limit")
                .param("circle", circleId)
                .param("me", me)
                .param("at", page.first() ? null : Sql.timestamp(page.instant(0)))
                .param("id", page.first() ? null : page.uuid(1).toString())
                .param("limit", page.fetch())
                .query(ThingStore::row)
                .list();
    }

    int countUnfiled(UUID circleId, UUID me) {
        return jdbc.sql("select count(*) from things t where t.circle_id = :circle and" + PAGES_AND_LISTS + "and not "
                        + FILED_FOR_ME + " and not " + IN_A_PAGE_FOR_ME + " and " + Rules.sees("t", ":me"))
                .param("circle", circleId)
                .param("me", me)
                .query(Integer.class)
                .single();
    }

    /** The pages and lists of a circle that changed last, as far as the viewer may see them. */
    List<ThingRow> recent(UUID circleId, UUID me, int limit) {
        return jdbc.sql("select " + ThingStore.COLUMNS + " from things t where t.circle_id = :circle and"
                        + PAGES_AND_LISTS + "and (" + FILED_FOR_ME + " or not " + IN_A_PAGE_FOR_ME + ") and "
                        + Rules.sees("t", ":me") + " order by t.updated_at desc, t.id desc limit :limit")
                .param("circle", circleId)
                .param("me", me)
                .param("limit", limit)
                .query(ThingStore::row)
                .list();
    }

    /** What this person pinned in a circle and may still see, in the order they pinned it. */
    List<ThingRow> pinned(UUID circleId, UUID me, int limit) {
        return jdbc.sql("select " + ThingStore.COLUMNS + """
             from note_pins np join members pm on pm.id = np.member_id and pm.user_id = :me and pm.status = 'joined'
             join things t on t.id = np.thing_id
             where t.circle_id = :circle and\s""" + Rules.sees("t", ":me")
                        + " order by np.pinned_at, t.id limit :limit")
                .param("circle", circleId)
                .param("me", me)
                .param("limit", limit)
                .query(ThingStore::row)
                .list();
    }

    /** The emoji of each of these things, and who changed it last: kept with the page, the list or the folder it is. */
    Map<UUID, Extra> extras(List<UUID> thingIds) {
        if (thingIds.isEmpty()) {
            return Map.of();
        }
        record Row(UUID id, Extra extra) {}
        return jdbc
                .sql("""
            select t.id, coalesce(p.emoji, c.emoji, fo.emoji, '') as emoji,
                   coalesce(p.edited_by, c.edited_by) as edited_by, coalesce(p.edited_at, c.edited_at) as edited_at
            from things t left join pages p on p.thing_id = t.id left join checklists c on c.thing_id = t.id
            left join folders fo on fo.thing_id = t.id
            where t.id in (:ids)
            """)
                .param("ids", thingIds)
                .query((rs, n) -> new Row(
                        rs.getObject("id", UUID.class),
                        new Extra(
                                rs.getString("emoji"),
                                rs.getObject("edited_by", UUID.class),
                                Sql.instant(rs, "edited_at"))))
                .list()
                .stream()
                .collect(Collectors.toMap(Row::id, Row::extra));
    }
}
