package app.homeport.api.page;

import app.homeport.api.common.Rules;
import app.homeport.api.common.Sql;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes the words of pages. Who may read one is decided by the thing it is. */
@Repository
public class PageStore {

    /** What a page keeps besides its blocks. */
    public record PageDetails(String body, String emoji, UUID editedBy, Instant editedAt) {}

    private final JdbcClient jdbc;

    PageStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(UUID thingId, String body) {
        jdbc.sql("insert into pages (thing_id, body) values (:id, :body) on conflict (thing_id) do nothing")
                .param("id", thingId)
                .param("body", body)
                .update();
    }

    public Optional<String> body(UUID thingId) {
        return jdbc.sql("select body from pages where thing_id = :id")
                .param("id", thingId)
                .query(String.class)
                .optional();
    }

    public PageDetails details(UUID thingId) {
        return jdbc.sql("select body, emoji, edited_by, edited_at from pages where thing_id = :id")
                .param("id", thingId)
                .query((rs, n) -> new PageDetails(
                        rs.getString("body"),
                        rs.getString("emoji"),
                        rs.getObject("edited_by", UUID.class),
                        Sql.instant(rs, "edited_at")))
                .single();
    }

    public void save(UUID thingId, String body) {
        jdbc.sql("update pages set body = :body where thing_id = :id")
                .param("id", thingId)
                .param("body", body)
                .update();
    }

    public void setEmoji(UUID thingId, String emoji) {
        jdbc.sql("update pages set emoji = :emoji where thing_id = :id")
                .param("id", thingId)
                .param("emoji", emoji)
                .update();
    }

    /**
     * Writes down that a page changed: its plain words as they now are, who changed it, and its version one
     * higher.
     */
    public void edited(UUID thingId, String body, UUID by) {
        jdbc.sql("""
            update pages set body = :body, version = version + 1, edited_by = :by, edited_at = now()
            where thing_id = :id
            """).param("id", thingId).param("body", body).param("by", by).update();
    }

    /**
     * Where a page stands for one viewer, as a short text that changes whenever anything they would be shown
     * changes: a block, the title, who sees it, a list or a live thing that stands in it, where it is filed,
     * their own pin. Empty when they may not see the page. One small question to the database.
     */
    public Optional<String> state(UUID thingId, UUID me) {
        return jdbc.sql("""
            select p.version || '.' || (extract(epoch from t.updated_at) * 1000000)::bigint
              || '.' || coalesce((select sum((extract(epoch from bt.updated_at) * 1000)::bigint)
                                  from page_blocks b join things bt on bt.id = b.thing_id
                                  where b.page_id = p.thing_id), 0)
              || '.' || coalesce((select extract(epoch from f.filed_at)::bigint from filed f where f.thing_id = p.thing_id), 0)
              || '.' || (select count(*) from note_pins np join members pm on pm.id = np.member_id
                         where np.thing_id = p.thing_id and pm.user_id = :me)
            from pages p join things t on t.id = p.thing_id
            where p.thing_id = :id and\s""" + Rules.sees("t", ":me"))
                .param("id", thingId)
                .param("me", me)
                .query(String.class)
                .optional();
    }

    /** The first words of these pages, for lists. */
    public Map<UUID, String> starts(List<UUID> thingIds) {
        if (thingIds.isEmpty()) {
            return Map.of();
        }
        record Start(UUID id, String text) {}
        return jdbc
                .sql("select thing_id, left(body, 140) as start from pages where thing_id in (:ids)")
                .param("ids", thingIds)
                .query((rs, n) -> new Start(rs.getObject("thing_id", UUID.class), rs.getString("start")))
                .list()
                .stream()
                .collect(Collectors.toMap(Start::id, Start::text));
    }
}
