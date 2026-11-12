package app.homeport.api.vault;

import app.homeport.api.common.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes helpers, the sealed shares they keep, and recoveries. */
@Repository
public class RecoveryStore {

    public record HelperRow(
            UUID id,
            UUID ownerId,
            UUID helperId,
            HelperState state,
            String sealedShare,
            Instant askedAt,
            Instant answeredAt) {}

    public record RecoveryRow(
            UUID id,
            UUID ownerId,
            String tempPublicKey,
            RecoveryState state,
            Instant startedAt,
            Instant lapsesAt,
            Instant endedAt,
            UUID clientId) {}

    public record GivenShare(UUID recoveryId, UUID helperId, String resealedShare) {}

    private final JdbcClient jdbc;

    RecoveryStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // ---------- helpers ----------

    private static HelperRow helper(ResultSet rs, int n) throws SQLException {
        return new HelperRow(
                rs.getObject("id", UUID.class),
                rs.getObject("owner_id", UUID.class),
                rs.getObject("helper_id", UUID.class),
                HelperState.read(rs.getString("state")),
                rs.getString("sealed_share"),
                Sql.instant(rs, "asked_at"),
                Sql.instant(rs, "answered_at"));
    }

    /** The people this person asked to be helpers, in the order they were asked. Five at most. */
    public List<HelperRow> helpersOf(UUID ownerId) {
        return jdbc.sql("select * from vault_helpers where owner_id = :owner order by asked_at, id")
                .param("owner", ownerId)
                .query(RecoveryStore::helper)
                .list();
    }

    /** The people who asked this person to be their helper, as long as the two are still in a circle together. */
    public List<HelperRow> helping(UUID helperId) {
        return jdbc.sql("select h.* from vault_helpers h where h.helper_id = :me and "
                        + VaultStore.together("h.owner_id", ":me") + " order by h.asked_at, h.id")
                .param("me", helperId)
                .query(RecoveryStore::helper)
                .list();
    }

    /** One helper row, held until the transaction ends so two answers at once can't cross. */
    public Optional<HelperRow> helperForChange(UUID id) {
        return jdbc.sql("select * from vault_helpers where id = :id for update")
                .param("id", id)
                .query(RecoveryStore::helper)
                .optional();
    }

    public Optional<HelperRow> helperOf(UUID ownerId, UUID helperId) {
        return jdbc.sql("select * from vault_helpers where owner_id = :owner and helper_id = :helper for update")
                .param("owner", ownerId)
                .param("helper", helperId)
                .query(RecoveryStore::helper)
                .optional();
    }

    public UUID insertHelper(UUID ownerId, UUID helperId, UUID clientId) {
        UUID id = UUID.randomUUID();
        jdbc.sql(
                        "insert into vault_helpers (id, owner_id, helper_id, client_id) values (:id, :owner, :helper, :client)")
                .param("id", id)
                .param("owner", ownerId)
                .param("helper", helperId)
                .param("client", clientId)
                .update();
        return id;
    }

    /** Asked again after a no: the question is open once more. */
    public void askAgain(UUID id) {
        jdbc.sql("update vault_helpers set state = 'asked', asked_at = now(), answered_at = null, sealed_share = null"
                        + " where id = :id")
                .param("id", id)
                .update();
    }

    /** A yes or a no. A no throws the share away. */
    public void answer(UUID id, HelperState state) {
        jdbc.sql("""
            update vault_helpers set state = :state, answered_at = now(),
              sealed_share = case when :state = 'accepted' then sealed_share end
            where id = :id
            """).param("id", id).param("state", state.code()).update();
    }

    public void removeHelper(UUID id) {
        jdbc.sql("delete from vault_helpers where id = :id").param("id", id).update();
    }

    /**
     * Replaces every share this person's helpers keep with the ones from a new split. Shares from two splits
     * don't fit together, so a helper who gets none in this one loses the old one.
     */
    public void saveShares(UUID ownerId, Map<UUID, String> shareByHelperRow) {
        forgetShares(ownerId);
        shareByHelperRow.forEach((id, share) -> jdbc.sql(
                        "update vault_helpers set sealed_share = :share where id = :id and owner_id = :owner and state = 'accepted'")
                .param("id", id)
                .param("owner", ownerId)
                .param("share", share)
                .update());
    }

    public void forgetShares(UUID ownerId) {
        jdbc.sql("update vault_helpers set sealed_share = null where owner_id = :owner")
                .param("owner", ownerId)
                .update();
    }

    /** How many helpers hold a share and are still in a circle with this person: two are needed to get back in. */
    public int usableHelpers(UUID ownerId) {
        return jdbc.sql("select count(*) from vault_helpers h where h.owner_id = :owner and h.state = 'accepted'"
                        + " and h.sealed_share is not null and " + VaultStore.together("h.helper_id", "h.owner_id"))
                .param("owner", ownerId)
                .query(Integer.class)
                .single();
    }

    // ---------- recoveries ----------

    private static RecoveryRow recovery(ResultSet rs, int n) throws SQLException {
        return new RecoveryRow(
                rs.getObject("id", UUID.class),
                rs.getObject("owner_id", UUID.class),
                rs.getString("temp_public_key"),
                RecoveryState.read(rs.getString("state")),
                Sql.instant(rs, "started_at"),
                Sql.instant(rs, "lapses_at"),
                Sql.instant(rs, "ended_at"),
                rs.getObject("client_id", UUID.class));
    }

    /**
     * Recoveries whose seven days are over stop being open. Run before anything reads one, and by a job, so
     * the clock needs nobody to be looking. Returns the ones that lapsed just now.
     */
    public List<RecoveryRow> lapseDue() {
        List<RecoveryRow> lapsed = jdbc.sql("""
            update vault_recoveries set state = 'lapsed', ended_at = now()
            where state = 'open' and lapses_at <= now() returning *
            """).query(RecoveryStore::recovery).list();
        lapsed.forEach(r -> forgetGiven(r.id()));
        return lapsed;
    }

    /** A person's open recovery, held until the transaction ends. */
    public Optional<RecoveryRow> openOf(UUID ownerId) {
        return jdbc.sql("select * from vault_recoveries where owner_id = :owner and state = 'open' for update")
                .param("owner", ownerId)
                .query(RecoveryStore::recovery)
                .optional();
    }

    /** The open recoveries of these people. */
    public List<RecoveryRow> openOf(List<UUID> ownerIds) {
        if (ownerIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("select * from vault_recoveries where owner_id in (:owners) and state = 'open'")
                .param("owners", ownerIds)
                .query(RecoveryStore::recovery)
                .list();
    }

    public Optional<RecoveryRow> find(UUID id) {
        return jdbc.sql("select * from vault_recoveries where id = :id")
                .param("id", id)
                .query(RecoveryStore::recovery)
                .optional();
    }

    public Optional<RecoveryRow> findForChange(UUID id) {
        return jdbc.sql("select * from vault_recoveries where id = :id for update")
                .param("id", id)
                .query(RecoveryStore::recovery)
                .optional();
    }

    public Optional<RecoveryRow> byClientId(UUID ownerId, UUID clientId) {
        return jdbc.sql("select * from vault_recoveries where owner_id = :owner and client_id = :client")
                .param("owner", ownerId)
                .param("client", clientId)
                .query(RecoveryStore::recovery)
                .optional();
    }

    public UUID start(UUID ownerId, String tempPublicKey, int days, UUID clientId) {
        UUID id = UUID.randomUUID();
        jdbc.sql("""
            insert into vault_recoveries (id, owner_id, temp_public_key, lapses_at, client_id)
            values (:id, :owner, :key, now() + make_interval(days => :days), :client)
            """)
                .param("id", id)
                .param("owner", ownerId)
                .param("key", tempPublicKey)
                .param("days", days)
                .param("client", clientId)
                .update();
        return id;
    }

    /** Ends a recovery and throws away the shares that were passed on for it. */
    public void close(UUID id, RecoveryState state) {
        jdbc.sql("update vault_recoveries set state = :state, ended_at = now() where id = :id and state = 'open'")
                .param("id", id)
                .param("state", state.code())
                .update();
        forgetGiven(id);
    }

    /** Ends whatever recovery this person has open. */
    public void closeOpen(UUID ownerId, RecoveryState state) {
        openOf(ownerId).ifPresent(open -> close(open.id(), state));
    }

    private void forgetGiven(UUID recoveryId) {
        jdbc.sql("delete from vault_recovery_shares where recovery_id = :id")
                .param("id", recoveryId)
                .update();
    }

    /** A helper's share, sealed again for the new phone. Passing it on twice keeps the later one. */
    public void give(UUID recoveryId, UUID helperId, String resealedShare) {
        jdbc.sql("""
            insert into vault_recovery_shares (recovery_id, helper_id, resealed_share) values (:recovery, :helper, :share)
            on conflict (recovery_id, helper_id) do update set resealed_share = excluded.resealed_share, given_at = now()
            """)
                .param("recovery", recoveryId)
                .param("helper", helperId)
                .param("share", resealedShare)
                .update();
    }

    /** The shares passed on so far for these recoveries, in the order they came. */
    public List<GivenShare> given(List<UUID> recoveryIds) {
        if (recoveryIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
            select recovery_id, helper_id, resealed_share from vault_recovery_shares
            where recovery_id in (:ids) order by given_at, helper_id
            """)
                .param("ids", recoveryIds)
                .query((rs, n) -> new GivenShare(
                        rs.getObject("recovery_id", UUID.class),
                        rs.getObject("helper_id", UUID.class),
                        rs.getString("resealed_share")))
                .list();
    }
}
