package app.homeport.api.export;

import app.homeport.api.common.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes the exports people asked for. */
@Repository
public class ExportStore {

    public record ExportRow(
            UUID id,
            UUID userId,
            UUID circleId,
            ExportScope scope,
            ExportState state,
            String storageKey,
            Long bytes,
            Integer files,
            List<String> leftOut,
            int attempts,
            Instant createdAt,
            Instant readyAt,
            Instant expiresAt) {}

    private final JdbcClient jdbc;

    ExportStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static ExportRow row(ResultSet rs, int n) throws SQLException {
        return new ExportRow(
                rs.getObject("id", UUID.class),
                rs.getObject("user_id", UUID.class),
                rs.getObject("circle_id", UUID.class),
                ExportScope.read(rs.getString("scope")),
                ExportState.read(rs.getString("state")),
                rs.getString("storage_key"),
                (Long) rs.getObject("bytes"),
                (Integer) rs.getObject("files"),
                Sql.strings(rs, "left_out"),
                rs.getInt("attempts"),
                Sql.instant(rs, "created_at"),
                Sql.instant(rs, "ready_at"),
                Sql.instant(rs, "expires_at"));
    }

    /** Asks for an export. Sending the same clientId again asks for nothing new and returns the first one's id. */
    public UUID insert(UUID userId, UUID circleId, ExportScope scope, UUID clientId) {
        return jdbc.sql("""
            insert into exports (id, user_id, circle_id, scope, client_id) values (:id, :user, :circle, :scope, :client)
            on conflict (user_id, client_id) do update set client_id = excluded.client_id
            returning id
            """)
                .param("id", UUID.randomUUID())
                .param("user", userId)
                .param("circle", circleId)
                .param("scope", scope.code())
                .param("client", clientId)
                .query(UUID.class)
                .single();
    }

    public Optional<ExportRow> find(UUID id) {
        return jdbc.sql("select * from exports where id = :id")
                .param("id", id)
                .query(ExportStore::row)
                .optional();
    }

    /** A person's exports of a circle, newest first. They last a week, so there are never many. */
    public List<ExportRow> of(UUID userId, UUID circleId) {
        return jdbc.sql(
                        "select * from exports where user_id = :user and circle_id = :circle order by created_at desc limit 10")
                .param("user", userId)
                .param("circle", circleId)
                .query(ExportStore::row)
                .list();
    }

    /** How many exports this person has waiting or under way, anywhere. */
    public int underWay(UUID userId) {
        return jdbc.sql("select count(*) from exports where user_id = :user and state in ('waiting', 'working')")
                .param("user", userId)
                .query(Integer.class)
                .single();
    }

    /**
     * Takes the oldest export that waits, so no other copy of the API takes it too. One that was taken long
     * ago and never finished (the API stopped in the middle) is taken again, three times at most.
     */
    public Optional<ExportRow> take() {
        return jdbc.sql("""
            update exports set state = 'working', started_at = now(), attempts = attempts + 1
            where id = (select id from exports
                        where state = 'waiting' or (state = 'working' and started_at < now() - interval '30 minutes')
                        order by created_at limit 1 for update skip locked)
            returning *
            """).query(ExportStore::row).optional();
    }

    public void ready(UUID id, String storageKey, long bytes, int files, List<String> leftOut, Instant expiresAt) {
        jdbc.sql("""
            update exports set state = 'ready', storage_key = :key, bytes = :bytes, files = :files,
              left_out = :left, ready_at = now(), expires_at = :expires
            where id = :id
            """)
                .param("id", id)
                .param("key", storageKey)
                .param("bytes", bytes)
                .param("files", files)
                .param("left", leftOut.toArray(String[]::new))
                .param("expires", Sql.timestamp(expiresAt))
                .update();
    }

    public void failed(UUID id) {
        jdbc.sql("update exports set state = 'failed' where id = :id")
                .param("id", id)
                .update();
    }

    public void delete(UUID id) {
        jdbc.sql("delete from exports where id = :id").param("id", id).update();
    }

    /**
     * Forgets exports whose week is over, and ones that failed or were never made a week ago. The database
     * queues each one's file for removal as its record goes. Returns how many went.
     */
    public int forgetExpired() {
        return jdbc.sql("""
            delete from exports where (state = 'ready' and expires_at <= now())
               or (state <> 'ready' and created_at < now() - interval '7 days')
            """).update();
    }
}
