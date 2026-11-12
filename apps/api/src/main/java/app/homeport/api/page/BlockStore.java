package app.homeport.api.page;

import app.homeport.api.common.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/** Reads and writes the blocks of pages, one at a time. Who may read a page is decided by the thing it is. */
@Repository
public class BlockStore {

    public record BlockRow(
            UUID id,
            UUID pageId,
            BlockKind kind,
            String text,
            List<Mark> marks,
            UUID thingId,
            UUID mediaId,
            Double lat,
            Double lng,
            double position,
            Instant updatedAt) {}

    /** The positions on either side of where a block is to go. {@code to} is null at the end. */
    public record Gap(double from, Double to) {}

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final TypeReference<List<Mark>> MARKS = new TypeReference<>() {};

    private final JdbcClient jdbc;

    BlockStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static BlockRow row(ResultSet rs, int n) throws SQLException {
        return new BlockRow(
                rs.getObject("id", UUID.class),
                rs.getObject("page_id", UUID.class),
                BlockKind.read(rs.getString("kind")),
                rs.getString("text"),
                JSON.readValue(rs.getString("marks"), MARKS),
                rs.getObject("thing_id", UUID.class),
                rs.getObject("media_id", UUID.class),
                (Double) rs.getObject("lat"),
                (Double) rs.getObject("lng"),
                rs.getDouble("position"),
                Sql.instant(rs, "updated_at"));
    }

    /** The blocks of a page, in order. A page holds 500 at most. */
    public List<BlockRow> of(UUID pageId) {
        return jdbc.sql("select * from page_blocks where page_id = :page order by position, id limit 500")
                .param("page", pageId)
                .query(BlockStore::row)
                .list();
    }

    public Optional<BlockRow> find(UUID blockId) {
        return jdbc.sql("select * from page_blocks where id = :id")
                .param("id", blockId)
                .query(BlockStore::row)
                .optional();
    }

    /** The block that was added with this clientId, when it was sent before. */
    public Optional<BlockRow> sentBefore(UUID pageId, UUID clientId) {
        return jdbc.sql("select * from page_blocks where page_id = :page and client_id = :client")
                .param("page", pageId)
                .param("client", clientId)
                .query(BlockStore::row)
                .optional();
    }

    public int count(UUID pageId) {
        return jdbc.sql("select count(*) from page_blocks where page_id = :page")
                .param("page", pageId)
                .query(Integer.class)
                .single();
    }

    /** True when an upload already stands in a block: one upload, one block. */
    public boolean holds(UUID mediaId) {
        return jdbc.sql("select exists (select 1 from page_blocks where media_id = :media)")
                .param("media", mediaId)
                .query(Boolean.class)
                .single();
    }

    /** Adds a block. Sending the same clientId again adds nothing and returns the block added the first time. */
    public UUID insert(
            UUID pageId,
            BlockKind kind,
            String text,
            List<Mark> marks,
            UUID thingId,
            UUID mediaId,
            Double lat,
            Double lng,
            double position,
            UUID addedBy,
            UUID clientId) {
        return jdbc.sql("""
            insert into page_blocks (id, page_id, kind, text, marks, thing_id, media_id, lat, lng, position, added_by, client_id)
            values (:id, :page, :kind, :text, cast(:marks as jsonb), :thing, :media, :lat, :lng, :position, :by, :client)
            on conflict (page_id, client_id) do update set client_id = excluded.client_id
            returning id
            """)
                .param("id", UUID.randomUUID())
                .param("page", pageId)
                .param("kind", kind.code())
                .param("text", text)
                .param("marks", JSON.writeValueAsString(marks))
                .param("thing", thingId)
                .param("media", mediaId)
                .param("lat", lat)
                .param("lng", lng)
                .param("position", position)
                .param("by", addedBy)
                .param("client", clientId)
                .query(UUID.class)
                .single();
    }

    public void change(UUID blockId, BlockKind kind, String text, List<Mark> marks, Double lat, Double lng) {
        jdbc.sql("""
            update page_blocks set kind = :kind, text = :text, marks = cast(:marks as jsonb), lat = :lat, lng = :lng,
              updated_at = now()
            where id = :id
            """)
                .param("id", blockId)
                .param("kind", kind.code())
                .param("text", text)
                .param("marks", JSON.writeValueAsString(marks))
                .param("lat", lat)
                .param("lng", lng)
                .update();
    }

    public void move(UUID blockId, double position) {
        jdbc.sql("update page_blocks set position = :position, updated_at = now() where id = :id")
                .param("id", blockId)
                .param("position", position)
                .update();
    }

    /** Removes a block. The database takes its upload with it. */
    public void delete(UUID blockId) {
        jdbc.sql("delete from page_blocks where id = :id").param("id", blockId).update();
    }

    /** Removes the words of a page (paragraphs, headings, bullets) and leaves everything else where it stands. */
    public void deleteText(UUID pageId) {
        jdbc.sql("delete from page_blocks where page_id = :page and kind in ('paragraph', 'heading', 'bullet')")
                .param("page", pageId)
                .update();
    }

    // ---------- where a block goes ----------

    /** The position after the last block of a page. */
    public double end(UUID pageId) {
        return jdbc.sql("select coalesce(max(position), 0) + 1 from page_blocks where page_id = :page")
                .param("page", pageId)
                .query(Double.class)
                .single();
    }

    /** The position before the first block of a page. */
    public double start(UUID pageId) {
        return jdbc.sql("select coalesce(min(position), 1) - 1 from page_blocks where page_id = :page")
                .param("page", pageId)
                .query(Double.class)
                .single();
    }

    /**
     * The gap just after one block of a page: its own position and that of the next block, leaving out the
     * block being moved. Empty when that block isn't in the page (any more).
     */
    public Optional<Gap> gapAfter(UUID pageId, UUID afterId, UUID movingId) {
        return jdbc.sql("""
            select a.position as from_position,
              (select min(n.position) from page_blocks n where n.page_id = a.page_id and n.position > a.position
                 and n.id <> cast(:moving as uuid)) as to_position
            from page_blocks a where a.id = :after and a.page_id = :page
            """)
                .param("after", afterId)
                .param("page", pageId)
                .param("moving", (movingId == null ? new UUID(0, 0) : movingId).toString())
                .query((rs, n) -> new Gap(rs.getDouble("from_position"), (Double) rs.getObject("to_position")))
                .optional();
    }

    /** Gives the blocks of a page whole-number positions again, in their order: room to put more between them. */
    public void respace(UUID pageId) {
        jdbc.sql("""
            update page_blocks b set position = r.n
            from (select id, row_number() over (order by position, id) as n from page_blocks where page_id = :page) r
            where b.id = r.id
            """).param("page", pageId).update();
    }

    /**
     * The plain words of a page, from its blocks in order: every paragraph, heading and bullet, and the words
     * under a photo, a file or a place. One line each. This is what pages.body is kept as.
     */
    public String words(UUID pageId) {
        return jdbc.sql("""
            select coalesce(string_agg(case when kind = 'bullet' then '• ' || text else text end, E'\\n'
                                       order by position, id) filter (where text <> ''), '')
            from page_blocks where page_id = :page
            """).param("page", pageId).query(String.class).single();
    }
}
