package app.homeport.api.folder;

import app.homeport.api.common.Rules;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Reads and writes spaces and folders, where things are filed, and pins. A person's tree is the real tree
 * with everything they may not see taken out: every query here that reads for someone asks Rules.sees for
 * each thing and each folder on the way.
 */
@Repository
public class FolderStore {

    /** How far a walk up or down the tree goes before it stops. Folders nest 50 deep at most (FolderService). */
    static final int FAR = 100;

    /**
     * A folder as one viewer sees it.
     *
     * @param parentId the folder it is in, when the viewer may see that one; null for a space, and for a
     *     folder that hangs at the top for this viewer
     */
    public record FolderRow(ThingRow thing, String emoji, UUID parentId) {}

    /** What is inside a folder for one viewer, at any depth. */
    public record Counts(int folders, int pages) {}

    /** One folder on the way up from a thing, and whether the viewer may see it. */
    public record Step(UUID id, String title, String emoji, boolean seen) {}

    /** Where a thing is filed. folderId is null for a space and for a thing taken out of its folder. */
    public record Spot(UUID folderId, double position) {}

    /** The positions on either side of where something is to go. {@code to} is null at the end. */
    public record Gap(double from, Double to) {}

    private static final String FOLDER = ThingStore.COLUMNS + ", fo.emoji, (select p.id from things p"
            + " where p.id = f.folder_id and " + Rules.sees("p", ":me") + ") as parent_id"
            + " from things t join folders fo on fo.thing_id = t.id left join filed f on f.thing_id = t.id ";

    private final JdbcClient jdbc;

    FolderStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static FolderRow row(ResultSet rs, int n) throws SQLException {
        return new FolderRow(ThingStore.row(rs, n), rs.getString("emoji"), rs.getObject("parent_id", UUID.class));
    }

    private static String text(UUID id) {
        return id == null ? null : id.toString();
    }

    // ---------- folders ----------

    public void insert(UUID thingId, String emoji) {
        jdbc.sql("insert into folders (thing_id, emoji) values (:id, :emoji) on conflict (thing_id) do nothing")
                .param("id", thingId)
                .param("emoji", emoji)
                .update();
    }

    public void setEmoji(UUID thingId, String emoji) {
        jdbc.sql("update folders set emoji = :emoji where thing_id = :id")
                .param("id", thingId)
                .param("emoji", emoji)
                .update();
    }

    /** A folder, for someone who may see it. */
    public Optional<FolderRow> find(UUID id, UUID me) {
        return jdbc.sql("select " + FOLDER + " where t.id = :id and " + Rules.sees("t", ":me"))
                .param("id", id)
                .param("me", me)
                .query(FolderStore::row)
                .optional();
    }

    /**
     * What stands at the top of a circle's Notes for this viewer: its spaces in their order, then any folder
     * whose parent they may not see. A hundred at most.
     */
    public List<FolderRow> top(UUID circleId, UUID me) {
        return jdbc.sql("select " + FOLDER + " where t.circle_id = :circle and t.kind = 'folder' and "
                        + Rules.sees("t", ":me") + " and (f.folder_id is null or not exists (select 1 from things up"
                        + " where up.id = f.folder_id and " + Rules.sees("up", ":me") + "))"
                        + " order by (f.folder_id is null) desc, f.position nulls last, t.created_at, t.id limit 100")
                .param("circle", circleId)
                .param("me", me)
                .query(FolderStore::row)
                .list();
    }

    /**
     * How many folders and how many other things (pages, lists, sheets) each of these folders holds for this
     * viewer, at any depth. Only what they may see is counted, and only as far down as they may see the
     * folders on the way.
     */
    public Map<UUID, Counts> counts(List<UUID> folderIds, UUID me) {
        if (folderIds.isEmpty()) {
            return Map.of();
        }
        record Row(UUID root, int folders, int pages) {}
        return jdbc
                .sql("""
            with recursive inside as (
              select f.folder_id as root, t.id, t.kind, 1 as depth
              from filed f join things t on t.id = f.thing_id
              where f.folder_id in (:roots) and\s""" + Rules.sees("t", ":me") + """

              union all
              select i.root, t.id, t.kind, i.depth + 1
              from inside i join filed f on f.folder_id = i.id join things t on t.id = f.thing_id
              where i.kind = 'folder' and i.depth < :far and\s""" + Rules.sees("t", ":me") + """
            )
            select root, count(*) filter (where kind = 'folder') as folders,
                   count(*) filter (where kind <> 'folder') as pages
            from inside group by root
            """)
                .param("roots", folderIds)
                .param("me", me)
                .param("far", FAR)
                .query((rs, n) -> new Row(rs.getObject("root", UUID.class), rs.getInt("folders"), rs.getInt("pages")))
                .list()
                .stream()
                .collect(Collectors.toMap(Row::root, r -> new Counts(r.folders(), r.pages())));
    }

    /** Everything inside a folder that this viewer may see, at any depth, as far down as they may see. */
    public List<ThingRow> inside(UUID folderId, UUID me, int limit) {
        return jdbc.sql("""
            with recursive inside as (
              select t.id, t.kind, 1 as depth
              from filed f join things t on t.id = f.thing_id
              where f.folder_id = :root and\s""" + Rules.sees("t", ":me") + """

              union all
              select t.id, t.kind, i.depth + 1
              from inside i join filed f on f.folder_id = i.id join things t on t.id = f.thing_id
              where i.kind = 'folder' and i.depth < :far and\s""" + Rules.sees("t", ":me") + """
            )
            select\s""" + ThingStore.COLUMNS + """
            from things t join inside i on i.id = t.id order by i.depth, t.id limit :limit
            """)
                .param("root", folderId)
                .param("me", me)
                .param("far", FAR)
                .param("limit", limit)
                .query(ThingStore::row)
                .list();
    }

    /** The folders above a thing, the nearest first, each with whether this viewer may see it. */
    public List<Step> above(UUID thingId, UUID me) {
        return jdbc.sql("""
            with recursive up as (
              select f.folder_id as id, 1 as depth from filed f where f.thing_id = :thing and f.folder_id is not null
              union all
              select f.folder_id, u.depth + 1 from up u join filed f on f.thing_id = u.id
              where f.folder_id is not null and u.depth < :far
            )
            select t.id, t.title, fo.emoji,\s""" + Rules.sees("t", ":me") + """
             as seen
            from up u join things t on t.id = u.id join folders fo on fo.thing_id = t.id order by u.depth
            """)
                .param("thing", thingId)
                .param("me", me)
                .param("far", FAR)
                .query((rs, n) -> new Step(
                        rs.getObject("id", UUID.class),
                        rs.getString("title"),
                        rs.getString("emoji"),
                        rs.getBoolean("seen")))
                .list();
    }

    /** A folder and every folder above it, whoever may see them: for "not inside itself" and "not too deep". */
    public List<UUID> chain(UUID folderId) {
        return jdbc.sql("""
            with recursive up as (
              select cast(:folder as uuid) as id, 1 as depth
              union all
              select f.folder_id, u.depth + 1 from up u join filed f on f.thing_id = u.id
              where f.folder_id is not null and u.depth < :far
            )
            select id from up order by depth
            """)
                .param("folder", folderId.toString())
                .param("far", FAR)
                .query(UUID.class)
                .list();
    }

    /**
     * Makes whoever moves a folder in this circle wait for anyone else doing the same, until the end of the
     * transaction. Two moves at the same moment could otherwise each put a folder inside the other.
     */
    public void oneMoveAtATime(UUID circleId) {
        jdbc.sql("select pg_advisory_xact_lock(hashtext(:circle))")
                .param("circle", "folders:" + circleId)
                .query((rs, n) -> 0)
                .list();
    }

    // ---------- where things are filed ----------

    public Optional<Spot> spot(UUID thingId) {
        return jdbc.sql("select folder_id, position from filed where thing_id = :thing")
                .param("thing", thingId)
                .query((rs, n) -> new Spot(rs.getObject("folder_id", UUID.class), rs.getDouble("position")))
                .optional();
    }

    /** Files a thing in a folder (or at the top, with no folder) at this position, wherever it was before. */
    public void put(UUID thingId, UUID folderId, double position) {
        jdbc.sql("""
            insert into filed (thing_id, folder_id, position) values (:thing, cast(:folder as uuid), :position)
            on conflict (thing_id) do update set folder_id = excluded.folder_id, position = excluded.position,
              filed_at = now()
            """)
                .param("thing", thingId)
                .param("folder", text(folderId))
                .param("position", position)
                .update();
    }

    /** The position after everything in a folder (or after everything at the top). */
    public double end(UUID folderId) {
        return jdbc.sql(
                        "select coalesce(max(position), 0) + 1 from filed where folder_id is not distinct from cast(:folder as uuid)")
                .param("folder", text(folderId))
                .query(Double.class)
                .single();
    }

    /** The position before everything in a folder. */
    public double start(UUID folderId) {
        return jdbc.sql(
                        "select coalesce(min(position), 1) - 1 from filed where folder_id is not distinct from cast(:folder as uuid)")
                .param("folder", text(folderId))
                .query(Double.class)
                .single();
    }

    /**
     * The gap just after one thing in a folder: its own position and that of whatever comes next, leaving out
     * the thing being moved. Empty when that thing isn't in the folder.
     */
    public Optional<Gap> gapAfter(UUID folderId, UUID afterId, UUID movingId) {
        return jdbc.sql("""
            select a.position as from_position,
              (select min(n.position) from filed n where n.folder_id is not distinct from a.folder_id
                 and n.position > a.position and n.thing_id <> :moving) as to_position
            from filed a where a.thing_id = :after and a.folder_id is not distinct from cast(:folder as uuid)
            """)
                .param("after", afterId)
                .param("moving", movingId)
                .param("folder", text(folderId))
                .query((rs, n) -> new Gap(rs.getDouble("from_position"), (Double) rs.getObject("to_position")))
                .optional();
    }

    /** Gives the things of a folder whole-number positions again, in their order: room to put more between them. */
    public void respace(UUID folderId) {
        jdbc.sql("""
            update filed f set position = r.n
            from (select thing_id, row_number() over (order by position, thing_id) as n from filed
                  where folder_id is not distinct from cast(:folder as uuid)) r
            where f.thing_id = r.thing_id
            """).param("folder", text(folderId)).update();
    }

    // ---------- pins ----------

    /** Pins a thing for one person. The time is the clock's, so pins made in one go still stand in the order they were made. */
    public void pin(UUID memberId, UUID thingId) {
        jdbc.sql("insert into note_pins (member_id, thing_id, pinned_at) values (:member, :thing, clock_timestamp())"
                        + " on conflict do nothing")
                .param("member", memberId)
                .param("thing", thingId)
                .update();
    }

    public void unpin(UUID memberId, UUID thingId) {
        jdbc.sql("delete from note_pins where member_id = :member and thing_id = :thing")
                .param("member", memberId)
                .param("thing", thingId)
                .update();
    }

    public int pins(UUID memberId) {
        return jdbc.sql("select count(*) from note_pins where member_id = :member")
                .param("member", memberId)
                .query(Integer.class)
                .single();
    }

    /** Which of these things the signed-in person has pinned. */
    public Set<UUID> pinnedAmong(List<UUID> thingIds, UUID me) {
        if (thingIds.isEmpty()) {
            return Set.of();
        }
        return Set.copyOf(jdbc.sql("""
            select np.thing_id from note_pins np join members m on m.id = np.member_id
            where m.user_id = :me and m.status = 'joined' and np.thing_id in (:ids)
            """)
                .param("me", me)
                .param("ids", thingIds)
                .query(UUID.class)
                .list());
    }

    // ---------- the first time ----------

    /** True for the one caller that gets to make a circle's starter spaces. */
    public boolean claimStart(UUID circleId) {
        return jdbc.sql("insert into notes_started (circle_id) values (:circle) on conflict do nothing")
                        .param("circle", circleId)
                        .update()
                > 0;
    }
}
