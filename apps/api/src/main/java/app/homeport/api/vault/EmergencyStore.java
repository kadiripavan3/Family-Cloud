package app.homeport.api.vault;

import app.homeport.api.common.Sealed;
import app.homeport.api.common.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes "If something happens": who is trusted, the wait, and the escrow. */
@Repository
public class EmergencyStore {

    public record EmergencyRow(
            UUID id,
            UUID ownerId,
            UUID trustedId,
            int waitHours,
            String note,
            String noteMine,
            EmergencyState state,
            Instant askedAt,
            Instant opensAt,
            Instant refusedAt,
            Instant openedAt) {}

    /** One item of an escrow, as far as its clear part goes. */
    public record EscrowItem(UUID thingId, String title, VaultCategory category, String site, Instant handedAt) {}

    /** What the trusted person is handed for one item once the escrow is open. */
    public record Handed(
            UUID thingId, String title, VaultCategory category, String site, String ciphertext, String wrappedKey) {}

    private final JdbcClient jdbc;

    EmergencyStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static EmergencyRow row(ResultSet rs, int n) throws SQLException {
        return new EmergencyRow(
                rs.getObject("id", UUID.class),
                rs.getObject("owner_id", UUID.class),
                rs.getObject("trusted_id", UUID.class),
                rs.getInt("wait_hours"),
                rs.getString("note"),
                rs.getString("note_mine"),
                EmergencyState.read(rs.getString("state")),
                Sql.instant(rs, "asked_at"),
                Sql.instant(rs, "opens_at"),
                Sql.instant(rs, "refused_at"),
                Sql.instant(rs, "opened_at"));
    }

    /**
     * The clock's part: every request whose wait is over without a no opens. Run before anything reads an
     * emergency, and by a job, so it needs nobody to be looking. Returns the ones that opened just now.
     */
    public List<EmergencyRow> openDue() {
        return jdbc.sql("""
            update vault_emergencies set state = 'open', opened_at = now(), updated_at = now()
            where state = 'asked' and opens_at <= now() returning *
            """).query(EmergencyStore::row).list();
    }

    /** A person's own emergency access, held until the transaction ends. */
    public Optional<EmergencyRow> ofOwner(UUID ownerId) {
        return jdbc.sql("select * from vault_emergencies where owner_id = :owner for update")
                .param("owner", ownerId)
                .query(EmergencyStore::row)
                .optional();
    }

    /**
     * An emergency access, for the person it trusts, as long as the two are still in a circle together. Held
     * until the transaction ends.
     */
    public Optional<EmergencyRow> entrusted(UUID id, UUID trustedId) {
        return jdbc.sql("select e.* from vault_emergencies e where e.id = :id and e.trusted_id = :me and "
                        + VaultStore.together("e.owner_id", ":me") + " for update of e")
                .param("id", id)
                .param("me", trustedId)
                .query(EmergencyStore::row)
                .optional();
    }

    /** Everyone who trusts this person, as long as they are still in a circle together. Bounded by their circles. */
    public List<EmergencyRow> entrustedTo(UUID trustedId) {
        return jdbc.sql("select e.* from vault_emergencies e where e.trusted_id = :me and "
                        + VaultStore.together("e.owner_id", ":me") + " order by e.created_at, e.id")
                .param("me", trustedId)
                .query(EmergencyStore::row)
                .list();
    }

    /** Turns it on, or replaces what was chosen. Whatever request was running is over: the state is ready again. */
    public UUID save(UUID ownerId, UUID trustedId, int waitHours, String note, String noteMine) {
        return jdbc.sql("""
            insert into vault_emergencies (id, owner_id, trusted_id, wait_hours, note, note_mine)
            values (:id, :owner, :trusted, :wait, :note, :mine)
            on conflict (owner_id) do update set trusted_id = excluded.trusted_id, wait_hours = excluded.wait_hours,
              note = excluded.note, note_mine = excluded.note_mine, state = 'ready', asked_at = null, opens_at = null,
              refused_at = null, opened_at = null, updated_at = now()
            returning id
            """)
                .param("id", UUID.randomUUID())
                .param("owner", ownerId)
                .param("trusted", trustedId)
                .param("wait", waitHours)
                .param("note", note)
                .param("mine", noteMine)
                .query(UUID.class)
                .single();
    }

    /** Throws the old escrow away and keeps the new one. */
    public void replaceItems(UUID id, Map<UUID, String> wrappedKeyByThing) {
        jdbc.sql("delete from vault_emergency_items where emergency_id = :id")
                .param("id", id)
                .update();
        wrappedKeyByThing.forEach((thing, key) -> jdbc.sql(
                        "insert into vault_emergency_items (emergency_id, thing_id, wrapped_key) values (:id, :thing, :key)")
                .param("id", id)
                .param("thing", thing)
                .param("key", key)
                .update());
    }

    /** Switches it off: the escrow goes with the row. */
    public void delete(UUID ownerId) {
        jdbc.sql("delete from vault_emergencies where owner_id = :owner")
                .param("owner", ownerId)
                .update();
    }

    /** The trusted person asked: the clock starts now and runs for the wait the owner chose. */
    public void ask(UUID id) {
        jdbc.sql("""
            update vault_emergencies set state = 'asked', asked_at = now(),
              opens_at = now() + make_interval(hours => wait_hours), updated_at = now()
            where id = :id and state = 'ready'
            """).param("id", id).update();
    }

    /** The owner said no: the request is over. */
    public void refuse(UUID id) {
        jdbc.sql("""
            update vault_emergencies set state = 'ready', asked_at = null, opens_at = null, refused_at = now(),
              updated_at = now()
            where id = :id and state = 'asked'
            """).param("id", id).update();
    }

    /** What opens, by title. Two hundred at most. */
    public List<EscrowItem> items(UUID id) {
        return jdbc.sql("""
            select i.thing_id, t.title, v.category, v.site, i.handed_at
            from vault_emergency_items i join things t on t.id = i.thing_id join vault_items v on v.thing_id = t.id
            where i.emergency_id = :id order by lower(t.title), t.id
            """)
                .param("id", id)
                .query((rs, n) -> new EscrowItem(
                        rs.getObject("thing_id", UUID.class),
                        rs.getString("title"),
                        VaultCategory.read(rs.getString("category")),
                        rs.getString("site"),
                        Sql.instant(rs, "handed_at")))
                .list();
    }

    /** Hands one item of an open escrow over, and writes down that it did (the first time counts). */
    public Optional<Handed> hand(UUID id, UUID thingId) {
        return jdbc.sql("""
            update vault_emergency_items i set handed_at = coalesce(i.handed_at, now())
            from things t join vault_items v on v.thing_id = t.id
            where i.emergency_id = :id and i.thing_id = :thing and t.id = i.thing_id
            returning i.thing_id, t.title, v.category, v.site, v.ciphertext, i.wrapped_key
            """)
                .param("id", id)
                .param("thing", thingId)
                .query((rs, n) -> new Handed(
                        rs.getObject("thing_id", UUID.class),
                        rs.getString("title"),
                        VaultCategory.read(rs.getString("category")),
                        rs.getString("site"),
                        rs.getString("ciphertext"),
                        rs.getString("wrapped_key")))
                .optional();
    }

    /** Which of these are real Vault items this person owns: only those can go into their escrow. */
    public List<UUID> ownedBy(UUID ownerId, Collection<UUID> thingIds) {
        if (thingIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
            select t.id from things t join vault_items v on v.thing_id = t.id
            join members o on o.id = t.owner_id and o.user_id = :me and o.status = 'joined'
            where t.id in (:ids) and v.ciphertext <> :sample
            """)
                .param("me", ownerId)
                .param("ids", thingIds)
                .param("sample", Sealed.SAMPLE)
                .query(UUID.class)
                .list();
    }

    /** True when this item is part of its owner's escrow. */
    public boolean holds(UUID ownerId, UUID thingId) {
        return jdbc.sql("""
            select exists (select 1 from vault_emergency_items i join vault_emergencies e on e.id = i.emergency_id
                           where e.owner_id = :owner and i.thing_id = :thing)
            """)
                .param("owner", ownerId)
                .param("thing", thingId)
                .query(Boolean.class)
                .single();
    }

    /** An item got a new key: the escrow keeps the new one, wrapped for the trusted person. */
    public void rewrap(UUID ownerId, UUID thingId, String wrappedKey) {
        jdbc.sql("""
            update vault_emergency_items i set wrapped_key = :key from vault_emergencies e
            where e.id = i.emergency_id and e.owner_id = :owner and i.thing_id = :thing
            """)
                .param("owner", ownerId)
                .param("thing", thingId)
                .param("key", wrappedKey)
                .update();
    }
}
