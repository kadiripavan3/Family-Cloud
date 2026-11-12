package app.homeport.api.vault;

import app.homeport.api.circle.MemberKind;
import app.homeport.api.circle.Role;
import app.homeport.api.common.Sql;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes people's Vaults: their keys, and who around them has one. */
@Repository
public class VaultStore {

    public record VaultRow(
            UUID userId,
            String publicKey,
            String wrappedPrivateKey,
            String salt,
            int n,
            int r,
            int p,
            int keyVersion,
            Instant keySavedAt,
            Instant createdAt) {}

    /**
     * Someone the viewer shares a circle with (or once did).
     *
     * @param memberId who they are in a circle the two share, or null when they share none any more
     * @param publicKey their Vault's public key, or null when they have no Vault
     */
    public record PersonRow(UUID userId, UUID memberId, String name, String avatarKey, String publicKey) {}

    /** A member of a circle, with their Vault's public key when they have one. */
    public record CircleKeyRow(
            UUID memberId,
            String name,
            String avatarKey,
            MemberKind kind,
            Role role,
            boolean hasPhone,
            String publicKey) {}

    /**
     * True when these two people are in a circle together. Use with two expressions that hold user ids, such
     * as {@code together("e.owner_id", ":me")}.
     */
    static String together(String a, String b) {
        return ("exists (select 1 from members ta join members tb on tb.circle_id = ta.circle_id"
                        + " where ta.user_id = %s and ta.status = 'joined' and tb.user_id = %s and tb.status = 'joined')")
                .formatted(a, b);
    }

    private final JdbcClient jdbc;

    VaultStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<VaultRow> find(UUID userId) {
        return jdbc.sql("select * from vaults where user_id = :me")
                .param("me", userId)
                .query((rs, n) -> new VaultRow(
                        rs.getObject("user_id", UUID.class),
                        rs.getString("public_key"),
                        rs.getString("wrapped_private_key"),
                        rs.getString("kdf_salt"),
                        rs.getInt("kdf_n"),
                        rs.getInt("kdf_r"),
                        rs.getInt("kdf_p"),
                        rs.getInt("key_version"),
                        Sql.instant(rs, "key_saved_at"),
                        Sql.instant(rs, "created_at")))
                .optional();
    }

    public boolean exists(UUID userId) {
        return jdbc.sql("select exists (select 1 from vaults where user_id = :me)")
                .param("me", userId)
                .query(Boolean.class)
                .single();
    }

    /** Makes a person's Vault. False when they already have one. */
    public boolean insert(UUID userId, String publicKey, String wrappedPrivateKey, String salt, int n, int r, int p) {
        return jdbc.sql("""
            insert into vaults (user_id, public_key, wrapped_private_key, kdf_salt, kdf_n, kdf_r, kdf_p)
            values (:me, :public, :wrapped, :salt, :n, :r, :p) on conflict (user_id) do nothing
            """)
                        .param("me", userId)
                        .param("public", publicKey)
                        .param("wrapped", wrappedPrivateKey)
                        .param("salt", salt)
                        .param("n", n)
                        .param("r", r)
                        .param("p", p)
                        .update()
                == 1;
    }

    /** A new Vault key: the same private key, wrapped afresh. The public key stays, so nothing shared has to change. */
    public void replaceKey(UUID userId, String wrappedPrivateKey, String salt, int n, int r, int p) {
        jdbc.sql("""
            update vaults set wrapped_private_key = :wrapped, kdf_salt = :salt, kdf_n = :n, kdf_r = :r, kdf_p = :p,
              key_version = key_version + 1, key_saved_at = null, updated_at = now()
            where user_id = :me
            """)
                .param("me", userId)
                .param("wrapped", wrappedPrivateKey)
                .param("salt", salt)
                .param("n", n)
                .param("r", r)
                .param("p", p)
                .update();
    }

    public void keySaved(UUID userId) {
        jdbc.sql("update vaults set key_saved_at = coalesce(key_saved_at, now()) where user_id = :me")
                .param("me", userId)
                .update();
    }

    /** Everyone in a circle who could hold a key one day (no pets), in the order the circle lists its people. */
    public List<CircleKeyRow> circleKeys(UUID circleId) {
        return jdbc.sql("""
            select m.id, m.name, a.storage_key as avatar_key, m.kind, m.role,
              (m.user_id is not null and m.status = 'joined') as has_phone, v.public_key
            from members m left join media a on a.id = m.avatar_media_id and a.status = 'ready'
            left join vaults v on v.user_id = m.user_id and m.status = 'joined'
            where m.circle_id = :circle and m.status <> 'left' and m.kind <> 'pet'
            order by array_position(array['owner','adult','teen','child','guest'], m.role), m.created_at, m.id
            """)
                .param("circle", circleId)
                .query((rs, n) -> new CircleKeyRow(
                        rs.getObject("id", UUID.class),
                        rs.getString("name"),
                        rs.getString("avatar_key"),
                        MemberKind.read(rs.getString("kind")),
                        Role.read(rs.getString("role")),
                        rs.getBoolean("has_phone"),
                        rs.getString("public_key")))
                .list();
    }

    private static final String PERSON = """
        select p.id as user_id, p.display_name as name, a.storage_key as avatar_key, v.public_key,
          (select m.id from members m join members mine on mine.circle_id = m.circle_id and mine.user_id = :me
             and mine.status = 'joined'
           where m.user_id = p.id and m.status = 'joined' order by m.created_at, m.id limit 1) as member_id
        from profiles p left join media a on a.id = p.avatar_media_id and a.status = 'ready'
        left join vaults v on v.user_id = p.id
        """;

    private static PersonRow person(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new PersonRow(
                rs.getObject("user_id", UUID.class),
                rs.getObject("member_id", UUID.class),
                rs.getString("name"),
                rs.getString("avatar_key"),
                rs.getString("public_key"));
    }

    /** These people, as the viewer knows them. */
    public List<PersonRow> persons(UUID me, Collection<UUID> userIds) {
        if (userIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(PERSON + " where p.id in (:users)")
                .param("me", me)
                .param("users", userIds)
                .query(VaultStore::person)
                .list();
    }

    /** Everyone with a sign-in the viewer shares a circle with, by name. At most 20 circles of 30. */
    public List<PersonRow> around(UUID me) {
        return jdbc.sql(PERSON + " where p.id <> :me and " + together("p.id", ":me") + " order by p.display_name, p.id")
                .param("me", me)
                .query(VaultStore::person)
                .list();
    }

    /**
     * The person behind a member of one of the viewer's circles, when that member has joined with a sign-in of
     * their own. Empty for a child without a phone, a pet, someone in a circle the viewer isn't in.
     */
    public Optional<UUID> userBehind(UUID memberId, UUID me) {
        return jdbc.sql("""
            select m.user_id from members m
            where m.id = :member and m.status = 'joined' and m.user_id is not null
              and exists (select 1 from members mine where mine.circle_id = m.circle_id and mine.user_id = :me
                          and mine.status = 'joined')
            """)
                .param("member", memberId)
                .param("me", me)
                .query(UUID.class)
                .optional();
    }
}
