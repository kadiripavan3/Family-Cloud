package app.homeport.api.page;

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

    public void save(UUID thingId, String body) {
        jdbc.sql("update pages set body = :body where thing_id = :id")
                .param("id", thingId)
                .param("body", body)
                .update();
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
