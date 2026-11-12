package app.homeport.api.vault;

import app.homeport.api.circle.MemberKind;
import app.homeport.api.circle.Role;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Rules;
import app.homeport.api.common.Sealed;
import app.homeport.api.common.Sql;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Reads and writes Vault items and the wrapped keys that open them. Who may know an item exists is decided
 * by the thing it is ({@link Rules}); who is handed its ciphertext is decided here, by the grants.
 */
@Repository
public class VaultItemStore {

    /** An item's clear part, as one viewer sees it, with where that viewer's own grant stands. */
    public record ItemRow(
            ThingRow thing,
            String ownerName,
            String ownerAvatarKey,
            VaultCategory category,
            String site,
            LocalDate expiresOn,
            VaultHealth health,
            int version,
            VaultAccess everyoneAccess,
            boolean sample,
            Instant changedAt,
            VaultAccess myAccess,
            GrantState myState,
            boolean myOnce,
            Instant myStopsAt) {}

    /** One drawer of the Vault: how many items of a category the viewer may see, and how many need a look. */
    public record Tally(VaultCategory category, int items, int fromOthers, int weak, int reused, int leaked) {}

    /** Someone in an item's circle, with what the item's sharing says about them. */
    public record SharingRow(
            UUID memberId,
            String name,
            String avatarKey,
            MemberKind kind,
            Role role,
            boolean hasPhone,
            String publicKey,
            boolean owner,
            boolean sees,
            boolean granted,
            VaultAccess access,
            boolean once,
            Instant stopsAt,
            GrantState state,
            Instant openedAt,
            Instant changedAt) {}

    /** A grant as it stands at the moment of handing the item out. */
    public record GrantRow(VaultAccess access, boolean once, Instant stopsAt, String wrappedKey, GrantState state) {}

    /** Someone who should be able to open an item of the viewer's and has no key for it yet. */
    public record WaitingRow(
            UUID thingId,
            String title,
            UUID circleId,
            UUID memberId,
            String name,
            String avatarKey,
            String publicKey) {}

    /** The line Today shows for an ID that runs out soon. */
    public record ExpiringRow(UUID thingId, String title, LocalDate expiresOn, List<String> avatarKeys) {}

    public record GlanceRow(UUID thingId, VaultCategory category, String site, LocalDate expiresOn) {}

    public record SealedItem(int version, String ciphertext) {}

    private static final String ITEM_COLUMNS = """
            , o.name as owner_name, oa.storage_key as owner_avatar_key, v.category, v.site, v.expires_on, v.health,
              v.version, v.everyone_access, (v.ciphertext = :sample) as sample, v.changed_at,
              g.access as my_access, coalesce(g.once, false) as my_once, g.stops_at as my_stops_at,
              (g.thing_id is not null) as my_granted, (g.wrapped_key is not null) as my_key,
              (g.used_at is not null) as my_used, (g.stops_at is not null and g.stops_at <= now()) as my_stopped
            from things t join vault_items v on v.thing_id = t.id
            join members o on o.id = t.owner_id
            left join media oa on oa.id = o.avatar_media_id and oa.status = 'ready'
            left join members mm on mm.circle_id = t.circle_id and mm.user_id = :me and mm.status = 'joined'
            left join vault_grants g on g.thing_id = t.id and g.member_id = mm.id
            """;

    private final JdbcClient jdbc;

    VaultItemStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static ItemRow item(ResultSet rs, int n) throws SQLException {
        String access = rs.getString("my_access");
        return new ItemRow(
                ThingStore.row(rs, n),
                rs.getString("owner_name"),
                rs.getString("owner_avatar_key"),
                VaultCategory.read(rs.getString("category")),
                rs.getString("site"),
                rs.getObject("expires_on", LocalDate.class),
                VaultHealth.read(rs.getString("health")),
                rs.getInt("version"),
                VaultAccess.read(rs.getString("everyone_access")),
                rs.getBoolean("sample"),
                Sql.instant(rs, "changed_at"),
                VaultAccess.read(access),
                GrantState.from(
                        rs.getBoolean("my_granted"),
                        rs.getBoolean("my_key"),
                        rs.getBoolean("my_used"),
                        rs.getBoolean("my_stopped")),
                rs.getBoolean("my_once"),
                Sql.instant(rs, "my_stops_at"));
    }

    // ---------- reading ----------

    /** An item's clear part, for someone who may see it. To everyone else it doesn't exist. */
    public Optional<ItemRow> find(UUID id, UUID me) {
        return jdbc.sql("select " + ThingStore.COLUMNS + ITEM_COLUMNS + " where t.id = :id and "
                        + Rules.sees("t", ":me"))
                .param("id", id)
                .param("me", me)
                .param("sample", Sealed.SAMPLE)
                .query(VaultItemStore::item)
                .optional();
    }

    /**
     * The items in a circle the viewer may see, last changed first, a page at a time.
     *
     * @param category only this drawer, or null for all six
     * @param mine true for the viewer's own, false for what others shared with them, null for both
     * @param needsALook true for only those whose password the phone found wanting
     */
    public List<ItemRow> list(
            UUID circleId, UUID me, VaultCategory category, Boolean mine, boolean needsALook, Keyset page) {
        return jdbc.sql("select " + ThingStore.COLUMNS + ITEM_COLUMNS + """
             where t.circle_id = :circle and t.place = 'vault'
               and (cast(:category as text) is null or v.category = :category)
               and (cast(:mine as boolean) is null or cast(:mine as boolean) = (o.user_id is not distinct from :me))
               and (not :look or v.health <> 'ok')
               and (cast(:at as timestamptz) is null or (t.updated_at, t.id) < (cast(:at as timestamptz), cast(:after as uuid)))
               and\s""" + Rules.sees("t", ":me")
                        + " order by t.updated_at desc, t.id desc limit :limit")
                .param("circle", circleId)
                .param("me", me)
                .param("sample", Sealed.SAMPLE)
                .param("category", category == null ? null : category.code())
                .param("mine", mine)
                .param("look", needsALook)
                .param("at", page.first() ? null : Sql.timestamp(page.instant(0)))
                .param("after", page.first() ? null : page.uuid(1).toString())
                .param("limit", page.fetch())
                .query(VaultItemStore::item)
                .list();
    }

    /**
     * Every item this person owns, in all their circles, last changed first, a page at a time: for choosing
     * what opens if something happens, and for anything their phone does to all of their own items.
     */
    public List<ItemRow> listOwn(UUID me, Keyset page) {
        return jdbc.sql("select " + ThingStore.COLUMNS + ITEM_COLUMNS + """
             where o.user_id = :me and o.status = 'joined' and t.place = 'vault'
               and (cast(:at as timestamptz) is null or (t.updated_at, t.id) < (cast(:at as timestamptz), cast(:after as uuid)))
               and\s""" + Rules.sees("t", ":me")
                        + " order by t.updated_at desc, t.id desc limit :limit")
                .param("me", me)
                .param("sample", Sealed.SAMPLE)
                .param("at", page.first() ? null : Sql.timestamp(page.instant(0)))
                .param("after", page.first() ? null : page.uuid(1).toString())
                .param("limit", page.fetch())
                .query(VaultItemStore::item)
                .list();
    }

    /** What the Vault's home counts for one viewer in one circle: a line for each drawer that holds something. */
    public List<Tally> tallies(UUID circleId, UUID me) {
        return jdbc.sql("""
            select v.category, count(*) as items,
              count(*) filter (where o.user_id is distinct from :me) as from_others,
              count(*) filter (where v.health = 'weak') as weak,
              count(*) filter (where v.health = 'reused') as reused,
              count(*) filter (where v.health = 'leaked') as leaked
            from things t join vault_items v on v.thing_id = t.id join members o on o.id = t.owner_id
            where t.circle_id = :circle and t.place = 'vault' and\s""" + Rules.sees("t", ":me") + " group by v.category")
                .param("circle", circleId)
                .param("me", me)
                .query((rs, n) -> new Tally(
                        VaultCategory.read(rs.getString("category")),
                        rs.getInt("items"),
                        rs.getInt("from_others"),
                        rs.getInt("weak"),
                        rs.getInt("reused"),
                        rs.getInt("leaked")))
                .list();
    }

    /** How many Vault items this person owns, in all their circles. */
    public int countOwnedBy(UUID userId) {
        return jdbc.sql("""
            select count(*) from things t join members o on o.id = t.owner_id and o.user_id = :me
            where t.kind = 'vault_item'
            """).param("me", userId).query(Integer.class).single();
    }

    /**
     * Everyone in the item's circle who could hold a key one day, the owner first, each with what the item's
     * sharing says about them: whether the one rule lets them see it, and where their grant stands.
     */
    public List<SharingRow> people(UUID thingId) {
        return jdbc.sql("""
            select m.id, m.name, a.storage_key as avatar_key, m.kind, m.role,
              (m.user_id is not null and m.status = 'joined') as has_phone, k.public_key,
              (m.id = t.owner_id) as owner,
              (true and\s""" + Rules.memberSees("t", "m") + """
              ) as sees,
              (g.thing_id is not null) as granted, g.access, coalesce(g.once, false) as once, g.stops_at,
              (g.wrapped_key is not null) as has_key, (g.used_at is not null) as used,
              (g.stops_at is not null and g.stops_at <= now()) as stopped, g.opened_at, g.changed_at
            from things t join members m on m.circle_id = t.circle_id and m.status <> 'left' and m.kind <> 'pet'
            left join media a on a.id = m.avatar_media_id and a.status = 'ready'
            left join vaults k on k.user_id = m.user_id and m.status = 'joined'
            left join vault_grants g on g.thing_id = t.id and g.member_id = m.id
            where t.id = :id
            order by (m.id = t.owner_id) desc, array_position(array['owner','adult','teen','child','guest'], m.role),
              m.created_at, m.id
            """)
                .param("id", thingId)
                .query((rs, n) -> new SharingRow(
                        rs.getObject("id", UUID.class),
                        rs.getString("name"),
                        rs.getString("avatar_key"),
                        MemberKind.read(rs.getString("kind")),
                        Role.read(rs.getString("role")),
                        rs.getBoolean("has_phone"),
                        rs.getString("public_key"),
                        rs.getBoolean("owner"),
                        rs.getBoolean("sees"),
                        rs.getBoolean("granted"),
                        VaultAccess.read(rs.getString("access")),
                        rs.getBoolean("once"),
                        Sql.instant(rs, "stops_at"),
                        GrantState.from(
                                rs.getBoolean("granted"),
                                rs.getBoolean("has_key"),
                                rs.getBoolean("used"),
                                rs.getBoolean("stopped")),
                        Sql.instant(rs, "opened_at"),
                        Sql.instant(rs, "changed_at")))
                .list();
    }

    /**
     * People who should be able to open one of this person's items and have no key for it yet, as far as a
     * key can be made for them now (they have a Vault). The owner's phone wraps the key for each next time it
     * is open. Two hundred at a time.
     */
    public List<WaitingRow> waiting(UUID ownerUserId) {
        return jdbc.sql("""
            select t.id, t.title, t.circle_id, m.id as member_id, m.name, a.storage_key as avatar_key, k.public_key
            from things t join vault_items v on v.thing_id = t.id and v.ciphertext <> :sample
            join members o on o.id = t.owner_id and o.user_id = :me and o.status = 'joined'
            join members m on m.circle_id = t.circle_id and m.id <> o.id and m.status = 'joined'
            join vaults k on k.user_id = m.user_id
            left join media a on a.id = m.avatar_media_id and a.status = 'ready'
            left join vault_grants g on g.thing_id = t.id and g.member_id = m.id
            where t.kind = 'vault_item' and t.audience <> 'me'
              and (g.thing_id is null or (g.wrapped_key is null and g.used_at is null
                                          and (g.stops_at is null or g.stops_at > now())))
              and\s""" + Rules.memberSees("t", "m")
                        + " order by t.updated_at desc, t.id, m.created_at, m.id limit 200")
                .param("me", ownerUserId)
                .param("sample", Sealed.SAMPLE)
                .query((rs, n) -> new WaitingRow(
                        rs.getObject("id", UUID.class),
                        rs.getString("title"),
                        rs.getObject("circle_id", UUID.class),
                        rs.getObject("member_id", UUID.class),
                        rs.getString("name"),
                        rs.getString("avatar_key"),
                        rs.getString("public_key")))
                .list();
    }

    /** Which of these members the one rule lets see the item, and who have joined with a Vault of their own. */
    public List<UUID> canHoldAKey(UUID thingId, Collection<UUID> memberIds) {
        if (memberIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
            select m.id from things t join members m on m.circle_id = t.circle_id and m.status = 'joined'
            join vaults k on k.user_id = m.user_id
            where t.id = :id and m.id in (:members) and\s""" + Rules.memberSees("t", "m"))
                .param("id", thingId)
                .param("members", memberIds)
                .query(UUID.class)
                .list();
    }

    // ---------- writing items ----------

    public void insert(
            UUID thingId,
            VaultCategory category,
            String site,
            LocalDate expiresOn,
            VaultHealth health,
            String ciphertext,
            UUID changedBy) {
        jdbc.sql("""
            insert into vault_items (thing_id, category, site, expires_on, health, ciphertext, changed_by)
            values (:id, :category, :site, :expires, :health, :ciphertext, :by) on conflict (thing_id) do nothing
            """)
                .param("id", thingId)
                .param("category", category.code())
                .param("site", site)
                .param("expires", expiresOn)
                .param("health", health.code())
                .param("ciphertext", ciphertext)
                .param("by", changedBy)
                .update();
    }

    public void saveClearPart(
            UUID thingId, VaultCategory category, String site, LocalDate expiresOn, VaultHealth health) {
        jdbc.sql("""
            update vault_items set category = :category, site = :site, expires_on = :expires, health = :health
            where thing_id = :id
            """)
                .param("id", thingId)
                .param("category", category.code())
                .param("site", site)
                .param("expires", expiresOn)
                .param("health", health.code())
                .update();
    }

    /**
     * Keeps a new ciphertext, if the item still stands at the version the phone read. False when someone else
     * saved in between.
     */
    public boolean saveCiphertext(UUID thingId, int version, String ciphertext, UUID changedBy) {
        return jdbc.sql("""
            update vault_items set ciphertext = :ciphertext, version = version + 1, changed_by = :by, changed_at = now()
            where thing_id = :id and version = :version
            """)
                        .param("id", thingId)
                        .param("version", version)
                        .param("ciphertext", ciphertext)
                        .param("by", changedBy)
                        .update()
                == 1;
    }

    public void setEveryoneAccess(UUID thingId, VaultAccess access) {
        jdbc.sql("update vault_items set everyone_access = :access where thing_id = :id")
                .param("id", thingId)
                .param("access", access.code())
                .update();
    }

    /** What is handed out: the ciphertext and the version it stands at, read together. */
    public SealedItem sealed(UUID thingId) {
        return jdbc.sql("select version, ciphertext from vault_items where thing_id = :id")
                .param("id", thingId)
                .query((rs, n) -> new SealedItem(rs.getInt("version"), rs.getString("ciphertext")))
                .single();
    }

    // ---------- grants ----------

    /**
     * One person's grant for one item, held until the transaction ends: of two phones asking at the same
     * moment, the second waits here and then sees what the first left.
     */
    public Optional<GrantRow> grantForOpening(UUID thingId, UUID memberId) {
        return jdbc.sql("""
            select access, once, stops_at, wrapped_key, (used_at is not null) as used,
              (stops_at is not null and stops_at <= now()) as stopped
            from vault_grants where thing_id = :id and member_id = :member for update
            """)
                .param("id", thingId)
                .param("member", memberId)
                .query((rs, n) -> new GrantRow(
                        VaultAccess.read(rs.getString("access")),
                        rs.getBoolean("once"),
                        Sql.instant(rs, "stops_at"),
                        rs.getString("wrapped_key"),
                        GrantState.from(
                                true,
                                rs.getString("wrapped_key") != null,
                                rs.getBoolean("used"),
                                rs.getBoolean("stopped"))))
                .optional();
    }

    /** Writes down that the item was handed out. A once-only key is erased in the same breath. */
    public void opened(UUID thingId, UUID memberId) {
        jdbc.sql("""
            update vault_grants set opened_at = now(), opened_times = opened_times + 1,
              used_at = case when once then now() end,
              wrapped_key = case when once then null else wrapped_key end
            where thing_id = :id and member_id = :member
            """).param("id", thingId).param("member", memberId).update();
    }

    public void changedBy(UUID thingId, UUID memberId) {
        jdbc.sql("update vault_grants set changed_at = now() where thing_id = :id and member_id = :member")
                .param("id", thingId)
                .param("member", memberId)
                .update();
    }

    /**
     * Gives one person their grant, or changes it. With a wrapped key it is a fresh grant: whatever was used
     * up or erased before is forgotten. Without one, the key they already hold stays (unless the item's key
     * changed, in which case the old one opens nothing and is dropped).
     */
    public void grant(
            UUID thingId,
            UUID memberId,
            VaultAccess access,
            boolean once,
            Instant stopsAt,
            String wrappedKey,
            boolean keyChanged) {
        jdbc.sql("""
            insert into vault_grants (thing_id, member_id, access, once, stops_at, wrapped_key)
            values (:id, :member, :access, :once, :stops, :key)
            on conflict (thing_id, member_id) do update set access = excluded.access, once = excluded.once,
              stops_at = excluded.stops_at,
              wrapped_key = case when excluded.wrapped_key is not null then excluded.wrapped_key
                                 when :changed then null else vault_grants.wrapped_key end,
              used_at = case when excluded.wrapped_key is not null then null else vault_grants.used_at end,
              given_at = case when excluded.wrapped_key is not null then now() else vault_grants.given_at end
            """)
                .param("id", thingId)
                .param("member", memberId)
                .param("access", access.code())
                .param("once", once)
                .param("stops", Sql.timestamp(stopsAt))
                .param("key", wrappedKey)
                .param("changed", keyChanged)
                .update();
    }

    /** Hands a key to someone who was waiting for one. Never replaces a key, and never revives one that was used up. */
    public boolean giveKey(UUID thingId, UUID memberId, VaultAccess access, String wrappedKey) {
        return jdbc.sql("""
            insert into vault_grants (thing_id, member_id, access, wrapped_key) values (:id, :member, :access, :key)
            on conflict (thing_id, member_id) do update set wrapped_key = excluded.wrapped_key, given_at = now()
              where vault_grants.wrapped_key is null and vault_grants.used_at is null
                and (vault_grants.stops_at is null or vault_grants.stops_at > now())
            """)
                        .param("id", thingId)
                        .param("member", memberId)
                        .param("access", access.code())
                        .param("key", wrappedKey)
                        .update()
                == 1;
    }

    /** Removes every grant for an item except those of these members (never an empty list: the owner is always one). */
    public void keepOnly(UUID thingId, Collection<UUID> memberIds) {
        jdbc.sql("delete from vault_grants where thing_id = :id and member_id not in (:keep)")
                .param("id", thingId)
                .param("keep", memberIds)
                .update();
    }

    /**
     * With "everyone": people who weren't given something by name get what everyone gets. The key they hold
     * stays, unless the item's key changed, in which case it opens nothing and is dropped.
     */
    public void everyoneElseGets(
            UUID thingId, Collection<UUID> namedMemberIds, VaultAccess access, boolean keyChanged) {
        jdbc.sql("""
            update vault_grants set access = :access, once = false, stops_at = null,
              wrapped_key = case when :changed then null else wrapped_key end
            where thing_id = :id and member_id not in (:named)
            """)
                .param("id", thingId)
                .param("named", namedMemberIds)
                .param("access", access.code())
                .param("changed", keyChanged)
                .update();
    }

    /** Removes the grants of people the one rule no longer lets see the item. */
    public void dropGrantsOfThoseWhoNoLongerSee(UUID thingId) {
        jdbc.sql("""
            delete from vault_grants g using things t, members m
            where g.thing_id = :id and t.id = g.thing_id and m.id = g.member_id and m.id <> t.owner_id
              and not\s""" + Rules.memberSees("t", "m")).param("id", thingId).update();
    }

    /**
     * The clock's part: a key that was shared until a moment that has passed is erased, so the database no
     * longer holds what the API would no longer hand out. Returns how many were erased.
     */
    public int eraseStopped() {
        return jdbc.sql(
                        "update vault_grants set wrapped_key = null where stops_at <= now() and wrapped_key is not null")
                .update();
    }

    // ---------- for Home ----------

    /** IDs in a circle that run out around this day, which the viewer may see, with pictures of who they are about. */
    public List<ExpiringRow> expiring(UUID circleId, UUID me, LocalDate from, LocalDate to) {
        return jdbc.sql("""
            select t.id, t.title, v.expires_on,
              array(select a.storage_key from thing_about ab join members am on am.id = ab.member_id
                    join media a on a.id = am.avatar_media_id and a.status = 'ready'
                    where ab.thing_id = t.id order by am.created_at limit 2) as avatar_keys
            from things t join vault_items v on v.thing_id = t.id
            where t.circle_id = :circle and t.place = 'vault' and v.expires_on between :from and :to and\s""" + Rules.sees("t", ":me") + " order by v.expires_on, t.id limit 20")
                .param("circle", circleId)
                .param("me", me)
                .param("from", from)
                .param("to", to)
                .query((rs, n) -> new ExpiringRow(
                        rs.getObject("id", UUID.class),
                        rs.getString("title"),
                        rs.getObject("expires_on", LocalDate.class),
                        Sql.strings(rs, "avatar_keys")))
                .list();
    }

    /** Items in a circle the viewer may see whose site or label holds these words. */
    public List<GlanceRow> bySite(UUID circleId, UUID me, String words, int limit) {
        return jdbc.sql("""
            select v.thing_id, v.category, v.site, v.expires_on
            from vault_items v join things t on t.id = v.thing_id
            where t.circle_id = :circle and t.place = 'vault' and v.site ilike :pattern and\s""" + Rules.sees("t", ":me") + """
             order by t.updated_at desc, t.id limit :limit
            """)
                .param("circle", circleId)
                .param("me", me)
                .param("pattern", Sql.anywhere(words))
                .param("limit", limit)
                .query(VaultItemStore::glance)
                .list();
    }

    public List<GlanceRow> glances(List<UUID> thingIds) {
        if (thingIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("select thing_id, category, site, expires_on from vault_items where thing_id in (:ids)")
                .param("ids", thingIds)
                .query(VaultItemStore::glance)
                .list();
    }

    private static GlanceRow glance(ResultSet rs, int n) throws SQLException {
        return new GlanceRow(
                rs.getObject("thing_id", UUID.class),
                VaultCategory.read(rs.getString("category")),
                rs.getString("site"),
                rs.getObject("expires_on", LocalDate.class));
    }
}
