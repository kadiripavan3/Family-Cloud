package app.homeport.api.activity;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import app.homeport.api.common.Sql;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes what people asked to see, and the answers. */
@Repository
public class AskStore {

    /** Where an ask stands. */
    public enum AskState {
        OPEN,
        ALLOWED,
        DECLINED,
        WITHDRAWN;

        @JsonValue
        public String code() {
            return Codes.of(this);
        }

        @JsonCreator
        public static AskState of(String code) {
            return Codes.parse(
                    AskState.class, code, () -> ApiProblem.badRequest("invalid_state", "That isn't an answer."));
        }

        public static AskState read(String code) {
            return Codes.read(AskState.class, code);
        }
    }

    public record AskRow(
            UUID id,
            UUID circleId,
            UUID thingId,
            UUID askerId,
            UUID ownerId,
            Instant until,
            boolean once,
            AskState state,
            Instant answeredAt,
            Instant createdAt) {}

    private final JdbcClient jdbc;

    AskStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static AskRow row(ResultSet rs, int n) throws SQLException {
        return new AskRow(
                rs.getObject("id", UUID.class),
                rs.getObject("circle_id", UUID.class),
                rs.getObject("thing_id", UUID.class),
                rs.getObject("asker_id", UUID.class),
                rs.getObject("owner_id", UUID.class),
                Sql.instant(rs, "until"),
                rs.getBoolean("once"),
                AskState.read(rs.getString("state")),
                Sql.instant(rs, "answered_at"),
                Sql.instant(rs, "created_at"));
    }

    /**
     * Keeps a question. Sending the same clientId again, or asking again while a question about the same
     * thing is still open, keeps nothing new. Returns the question's id and whether this call made it.
     */
    public Map.Entry<UUID, Boolean> insert(
            UUID circleId, UUID thingId, UUID askerId, UUID ownerId, Instant until, boolean once, UUID clientId) {
        Optional<UUID> before = jdbc.sql("""
            select id from asks where asker_id = :asker
              and ((client_id is not null and client_id = cast(:client as uuid)) or (thing_id = :thing and state = 'open'))
            order by created_at desc limit 1
            """)
                .param("asker", askerId)
                .param("client", clientId == null ? null : clientId.toString())
                .param("thing", thingId)
                .query(UUID.class)
                .optional();
        if (before.isPresent()) {
            return Map.entry(before.get(), false);
        }
        UUID id = UUID.randomUUID();
        jdbc.sql("""
            insert into asks (id, circle_id, thing_id, asker_id, owner_id, until, once, client_id)
            values (:id, :circle, :thing, :asker, :owner, :until, :once, :client)
            """)
                .param("id", id)
                .param("circle", circleId)
                .param("thing", thingId)
                .param("asker", askerId)
                .param("owner", ownerId)
                .param("until", Sql.timestamp(until))
                .param("once", once)
                .param("client", clientId)
                .update();
        return Map.entry(id, true);
    }

    public Optional<AskRow> find(UUID id) {
        return jdbc.sql("select * from asks where id = :id")
                .param("id", id)
                .query(AskStore::row)
                .optional();
    }

    public Map<UUID, AskRow> findAll(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        return jdbc.sql("select * from asks where id in (:ids)").param("ids", ids).query(AskStore::row).list().stream()
                .collect(Collectors.toMap(AskRow::id, Function.identity()));
    }

    /** The newest question this member asked about a thing, whatever became of it. */
    public Optional<AskRow> latest(UUID thingId, UUID askerId) {
        return jdbc.sql(
                        "select * from asks where thing_id = :thing and asker_id = :asker order by created_at desc limit 1")
                .param("thing", thingId)
                .param("asker", askerId)
                .query(AskStore::row)
                .optional();
    }

    /** Moves an open question on. False when it wasn't open any more: two phones answered at once. */
    public boolean answer(UUID id, AskState state) {
        return jdbc.sql("update asks set state = :state, answered_at = now() where id = :id and state = 'open'")
                        .param("id", id)
                        .param("state", state.code())
                        .update()
                > 0;
    }

    /** How many questions wait for this member's answer: the number on the Asks chip. */
    public int waitingFor(UUID ownerId) {
        return jdbc.sql("select count(*) from asks where owner_id = :owner and state = 'open'")
                .param("owner", ownerId)
                .query(Integer.class)
                .single();
    }

    /** The open questions about these things, whoever asked: they are settled when the thing is taken back. */
    public List<AskRow> openAbout(UUID thingId) {
        return jdbc.sql("select * from asks where thing_id = :thing and state = 'open'")
                .param("thing", thingId)
                .query(AskStore::row)
                .list();
    }
}
