package app.homeport.api.circle;

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

/** Reads and writes circles. */
@Repository
public class CircleStore {

    public record CircleRow(
            UUID id, CircleKind kind, String name, String coverKey, String joinCode, Instant createdAt) {}

    private static final String COLUMNS = """
        c.id, c.kind, c.name, cv.storage_key as cover_key, c.join_code, c.created_at
        from circles c left join media cv on cv.id = c.cover_media_id and cv.status = 'ready'
        """;

    private final JdbcClient jdbc;

    CircleStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static CircleRow row(ResultSet rs, int n) throws SQLException {
        return new CircleRow(
                rs.getObject("id", UUID.class),
                CircleKind.read(rs.getString("kind")),
                rs.getString("name"),
                rs.getString("cover_key"),
                rs.getString("join_code"),
                Sql.instant(rs, "created_at"));
    }

    /** Creates a circle. Sending the same clientId again creates nothing and returns the circle made the first time. */
    public UUID insert(UUID createdBy, CircleKind kind, String name, String joinCode, UUID clientId) {
        return jdbc.sql("""
            insert into circles (id, kind, name, join_code, created_by, client_id)
            values (:id, :kind, :name, :code, :me, :client)
            on conflict (created_by, client_id) do update set client_id = excluded.client_id
            returning id
            """)
                .param("id", UUID.randomUUID())
                .param("kind", kind.code())
                .param("name", name)
                .param("code", joinCode)
                .param("me", createdBy)
                .param("client", clientId)
                .query(UUID.class)
                .single();
    }

    /** A circle, for someone who is in it. To everyone else it doesn't exist. */
    public Optional<CircleRow> find(UUID id, UUID me) {
        return jdbc.sql("select " + COLUMNS + " where c.id = :id and " + Rules.inCircle("c.id", ":me"))
                .param("id", id)
                .param("me", me)
                .query(CircleStore::row)
                .optional();
    }

    public Optional<CircleRow> byJoinCode(String code) {
        return jdbc.sql("select " + COLUMNS + " where c.join_code = :code")
                .param("code", code)
                .query(CircleStore::row)
                .optional();
    }

    /** The circles a person is in, in the order they joined them. */
    public List<CircleRow> of(UUID me) {
        return jdbc.sql("select " + COLUMNS + """
             join members mine on mine.circle_id = c.id and mine.user_id = :me and mine.status = 'joined'
             order by mine.created_at, c.id
            """)
                .param("me", me)
                .query(CircleStore::row)
                .list();
    }

    public int countOf(UUID me) {
        return jdbc.sql("select count(*) from members where user_id = :me and status = 'joined'")
                .param("me", me)
                .query(Integer.class)
                .single();
    }

    public void update(UUID id, CircleKind kind, String name, UUID coverMediaId, boolean changeCover) {
        jdbc.sql("""
            update circles set kind = :kind, name = :name, updated_at = now(),
              cover_media_id = case when :change then cast(:cover as uuid) else cover_media_id end
            where id = :id
            """)
                .param("id", id)
                .param("kind", kind.code())
                .param("name", name)
                .param("change", changeCover)
                .param("cover", coverMediaId == null ? null : coverMediaId.toString())
                .update();
    }

    public void newJoinCode(UUID id, String code) {
        jdbc.sql("update circles set join_code = :code where id = :id")
                .param("id", id)
                .param("code", code)
                .update();
    }

    public void delete(UUID id) {
        jdbc.sql("delete from circles where id = :id").param("id", id).update();
    }

    /**
     * How many things of each kind are shared in these circles with this person: what "3,180 photos, 214
     * notes and 31 passwords shared here" is made of. What is only theirs isn't counted.
     */
    public Map<UUID, Map<String, Integer>> sharedCounts(List<UUID> circleIds, UUID me) {
        if (circleIds.isEmpty()) {
            return Map.of();
        }
        record Count(UUID circleId, String kind, int count) {}
        return jdbc
                .sql("select t.circle_id, t.kind, count(*) as n from things t where t.circle_id in (:circles)"
                        + " and t.audience <> 'me' and " + Rules.sees("t", ":me") + " group by t.circle_id, t.kind")
                .param("circles", circleIds)
                .param("me", me)
                .query((rs, n) ->
                        new Count(rs.getObject("circle_id", UUID.class), rs.getString("kind"), rs.getInt("n")))
                .list()
                .stream()
                .collect(Collectors.groupingBy(Count::circleId, Collectors.toMap(Count::kind, Count::count)));
    }
}
