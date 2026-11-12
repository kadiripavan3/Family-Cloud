package app.homeport.api.guest;

import app.homeport.api.common.Sql;
import app.homeport.api.thing.ThingKind;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes guest passes. */
@Repository
public class GuestPassStore {

    public record PassRow(
            UUID id,
            UUID circleId,
            String circleName,
            UUID madeBy,
            String guestName,
            String token,
            String code,
            Instant startsAt,
            Instant endsAt,
            String device,
            int wrongCodes,
            Instant endedAt) {}

    public record PassThing(UUID passId, UUID thingId, ThingKind kind, String title) {}

    private static final String COLUMNS = """
        p.id, p.circle_id, c.name as circle_name, p.made_by, p.guest_name, p.token, p.code, p.starts_at, p.ends_at,
        p.device, p.wrong_codes, p.ended_at from guest_passes p join circles c on c.id = p.circle_id
        """;

    private final JdbcClient jdbc;

    GuestPassStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static PassRow row(ResultSet rs, int n) throws SQLException {
        return new PassRow(
                rs.getObject("id", UUID.class),
                rs.getObject("circle_id", UUID.class),
                rs.getString("circle_name"),
                rs.getObject("made_by", UUID.class),
                rs.getString("guest_name"),
                rs.getString("token"),
                rs.getString("code"),
                Sql.instant(rs, "starts_at"),
                Sql.instant(rs, "ends_at"),
                rs.getString("device"),
                rs.getInt("wrong_codes"),
                Sql.instant(rs, "ended_at"));
    }

    /** Makes a pass. Sending the same clientId again makes nothing and returns the pass made the first time. */
    public UUID insert(
            UUID circleId,
            UUID madeBy,
            String guestName,
            String token,
            String code,
            Instant startsAt,
            Instant endsAt,
            UUID clientId) {
        return jdbc.sql("""
            insert into guest_passes (id, circle_id, made_by, guest_name, token, code, starts_at, ends_at, client_id)
            values (:id, :circle, :by, :guest, :token, :code, :starts, :ends, :client)
            on conflict (made_by, client_id) do update set client_id = excluded.client_id
            returning id
            """)
                .param("id", UUID.randomUUID())
                .param("circle", circleId)
                .param("by", madeBy)
                .param("guest", guestName)
                .param("token", token)
                .param("code", code)
                .param("starts", Sql.timestamp(startsAt))
                .param("ends", Sql.timestamp(endsAt))
                .param("client", clientId)
                .query(UUID.class)
                .single();
    }

    public void put(UUID passId, List<UUID> thingIds) {
        for (UUID thing : thingIds) {
            jdbc.sql("insert into guest_pass_things (pass_id, thing_id) values (:pass, :thing) on conflict do nothing")
                    .param("pass", passId)
                    .param("thing", thing)
                    .update();
        }
    }

    public Optional<PassRow> find(UUID id) {
        return jdbc.sql("select " + COLUMNS + " where p.id = :id")
                .param("id", id)
                .query(GuestPassStore::row)
                .optional();
    }

    public Optional<PassRow> byToken(String token) {
        return jdbc.sql("select " + COLUMNS + " where p.token = :token")
                .param("token", token)
                .query(GuestPassStore::row)
                .optional();
    }

    /** The passes of a circle, the ones still running first. Fifty at most: older ones have ended long ago. */
    public List<PassRow> of(UUID circleId) {
        return jdbc.sql("select " + COLUMNS + " where p.circle_id = :circle order by p.ends_at desc, p.id limit 50")
                .param("circle", circleId)
                .query(GuestPassStore::row)
                .list();
    }

    public List<PassThing> things(List<UUID> passIds) {
        if (passIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
            select g.pass_id, t.id, t.kind, t.title from guest_pass_things g join things t on t.id = g.thing_id
            where g.pass_id in (:ids) order by g.pass_id, t.created_at, t.id
            """)
                .param("ids", passIds)
                .query((rs, n) -> new PassThing(
                        rs.getObject("pass_id", UUID.class),
                        rs.getObject("id", UUID.class),
                        ThingKind.read(rs.getString("kind")),
                        rs.getString("title")))
                .list();
    }

    public void end(UUID id) {
        jdbc.sql("update guest_passes set ended_at = now() where id = :id and ended_at is null")
                .param("id", id)
                .update();
    }

    /** Ties the pass to the first phone that opens it with the right code. False when another phone got there first. */
    public boolean bind(UUID id, String device) {
        return jdbc.sql("update guest_passes set device = :device where id = :id and device is null")
                        .param("id", id)
                        .param("device", device)
                        .update()
                == 1;
    }

    public void wrongCode(UUID id) {
        jdbc.sql("update guest_passes set wrong_codes = wrong_codes + 1 where id = :id")
                .param("id", id)
                .update();
    }
}
