package app.homeport.api.thing;

import app.homeport.api.common.Keyset;
import app.homeport.api.common.Rules;
import app.homeport.api.common.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes what every kind of thing has in common: where it is, whose it is, and who it is shared with. */
@Repository
public class ThingStore {

    public record ThingRow(
            UUID id,
            UUID circleId,
            UUID ownerId,
            ThingKind kind,
            Place place,
            String title,
            Audience audience,
            boolean everyoneEdits,
            Instant createdAt,
            Instant updatedAt,
            boolean mine,
            boolean canEdit) {}

    /** One person a thing is shared with by name, with their picture, for the audience chip and sheet. */
    public record ShareRow(UUID thingId, UUID memberId, String name, String avatarKey, boolean canEdit) {}

    public record HideRow(UUID thingId, UUID memberId, String name, LocalDate through, boolean today) {}

    /** The columns of a thing as one viewer sees it. Use with a query that names the things table {@code t} and binds {@code :me}. */
    public static final String COLUMNS =
            "t.id, t.circle_id, t.owner_id, t.kind, t.place, t.title, t.audience, t.everyone_edits,"
                    + " t.created_at, t.updated_at, " + Rules.owns("t", ":me") + " as mine, " + Rules.edits("t", ":me")
                    + " as can_edit ";

    private final JdbcClient jdbc;

    ThingStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public static ThingRow row(ResultSet rs, int n) throws SQLException {
        return new ThingRow(
                rs.getObject("id", UUID.class),
                rs.getObject("circle_id", UUID.class),
                rs.getObject("owner_id", UUID.class),
                ThingKind.read(rs.getString("kind")),
                Place.read(rs.getString("place")),
                rs.getString("title"),
                Audience.read(rs.getString("audience")),
                rs.getBoolean("everyone_edits"),
                Sql.instant(rs, "created_at"),
                Sql.instant(rs, "updated_at"),
                rs.getBoolean("mine"),
                rs.getBoolean("can_edit"));
    }

    /** A thing, for someone who may see it. To everyone else it doesn't exist. */
    public Optional<ThingRow> find(UUID id, UUID me) {
        return jdbc.sql("select " + COLUMNS + " from things t where t.id = :id and " + Rules.sees("t", ":me"))
                .param("id", id)
                .param("me", me)
                .query(ThingStore::row)
                .optional();
    }

    /** These things, as far as the viewer may see them. */
    public List<ThingRow> findAll(List<UUID> ids, UUID me) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("select " + COLUMNS + " from things t where t.id in (:ids) and " + Rules.sees("t", ":me"))
                .param("ids", ids)
                .param("me", me)
                .query(ThingStore::row)
                .list();
    }

    /** Creates a thing. Sending the same clientId again creates nothing and returns the id made the first time. */
    public UUID insert(UUID circleId, UUID ownerId, ThingKind kind, String title, Audience audience, UUID clientId) {
        return jdbc.sql("""
            insert into things (id, circle_id, owner_id, kind, place, title, audience, client_id)
            values (:id, :circle, :owner, :kind, :place, :title, :audience, :client)
            on conflict (owner_id, client_id) do update set client_id = excluded.client_id
            returning id
            """)
                .param("id", UUID.randomUUID())
                .param("circle", circleId)
                .param("owner", ownerId)
                .param("kind", kind.code())
                .param("place", kind.place().code())
                .param("title", title)
                .param("audience", audience.code())
                .param("client", clientId)
                .query(UUID.class)
                .single();
    }

    /** True when this insert made the row: a second send of the same clientId finds it already there. */
    public boolean isNew(UUID id, String detailTable) {
        return !jdbc.sql("select exists (select 1 from " + detailTable + " where thing_id = :id)")
                .param("id", id)
                .query(Boolean.class)
                .single();
    }

    public void retitle(UUID id, String title) {
        jdbc.sql("update things set title = :title, updated_at = now() where id = :id")
                .param("id", id)
                .param("title", title)
                .update();
    }

    public void touch(UUID id) {
        jdbc.sql("update things set updated_at = now() where id = :id")
                .param("id", id)
                .update();
    }

    public void delete(UUID id) {
        jdbc.sql("delete from things where id = :id").param("id", id).update();
    }

    // ---------- who it is shared with ----------

    public void setAudience(UUID id, Audience audience, boolean everyoneEdits) {
        jdbc.sql("update things set audience = :audience, everyone_edits = :edits, updated_at = now() where id = :id")
                .param("id", id)
                .param("audience", audience.code())
                .param("edits", everyoneEdits)
                .update();
    }

    public void clearShares(UUID id) {
        jdbc.sql("delete from thing_shares where thing_id = :id")
                .param("id", id)
                .update();
    }

    public void share(UUID id, UUID memberId, boolean canEdit) {
        jdbc.sql("""
            insert into thing_shares (thing_id, member_id, can_edit) values (:id, :member, :edit)
            on conflict (thing_id, member_id) do update set can_edit = excluded.can_edit
            """)
                .param("id", id)
                .param("member", memberId)
                .param("edit", canEdit)
                .update();
    }

    public void clearHides(UUID id) {
        jdbc.sql("delete from thing_hides where thing_id = :id").param("id", id).update();
    }

    public void hide(UUID id, UUID memberId, LocalDate through) {
        jdbc.sql("""
            insert into thing_hides (thing_id, member_id, through) values (:id, :member, :through)
            on conflict (thing_id, member_id) do update set through = excluded.through
            """)
                .param("id", id)
                .param("member", memberId)
                .param("through", through)
                .update();
    }

    /** Who these things are shared with by name, in the order the circle lists its people. */
    public List<ShareRow> shares(List<UUID> thingIds) {
        if (thingIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
            select s.thing_id, s.member_id, m.name, a.storage_key as avatar_key, s.can_edit
            from thing_shares s join members m on m.id = s.member_id and m.status <> 'left'
            left join media a on a.id = m.avatar_media_id and a.status = 'ready'
            where s.thing_id in (:ids) order by s.thing_id, m.created_at, m.id
            """)
                .param("ids", thingIds)
                .query((rs, n) -> new ShareRow(
                        rs.getObject("thing_id", UUID.class),
                        rs.getObject("member_id", UUID.class),
                        rs.getString("name"),
                        rs.getString("avatar_key"),
                        rs.getBoolean("can_edit")))
                .list();
    }

    /** Who these things are hidden from, and whether that still holds today. */
    public List<HideRow> hides(List<UUID> thingIds) {
        if (thingIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
            select h.thing_id, h.member_id, m.name, h.through, (h.through is null or h.through >= current_date) as today
            from thing_hides h join members m on m.id = h.member_id and m.status <> 'left'
            where h.thing_id in (:ids) order by h.thing_id, m.created_at, m.id
            """)
                .param("ids", thingIds)
                .query((rs, n) -> new HideRow(
                        rs.getObject("thing_id", UUID.class),
                        rs.getObject("member_id", UUID.class),
                        rs.getString("name"),
                        rs.getObject("through", LocalDate.class),
                        rs.getBoolean("today")))
                .list();
    }

    // ---------- who it is about ----------

    public void setAbout(UUID id, List<UUID> memberIds) {
        jdbc.sql("delete from thing_about where thing_id = :id").param("id", id).update();
        for (UUID member : memberIds) {
            jdbc.sql("insert into thing_about (thing_id, member_id) values (:id, :member) on conflict do nothing")
                    .param("id", id)
                    .param("member", member)
                    .update();
        }
    }

    /** What is kept about one member that the viewer may see, newest first. */
    public List<ThingRow> about(UUID memberId, UUID me, int limit) {
        return jdbc.sql("select " + COLUMNS + """
             from things t join thing_about ab on ab.thing_id = t.id and ab.member_id = :member
             where\s""" + Rules.sees("t", ":me")
                        + " order by t.updated_at desc, t.id desc limit :limit")
                .param("member", memberId)
                .param("me", me)
                .param("limit", limit)
                .query(ThingStore::row)
                .list();
    }

    // ---------- lists ----------

    /**
     * The things in a circle the viewer may see, last changed first, a page at a time. With a kind, only that
     * kind; with words, only those whose title holds them.
     */
    public List<ThingRow> list(UUID circleId, UUID me, ThingKind kind, Place place, String words, Keyset page) {
        return jdbc.sql("select " + COLUMNS + """
             from things t where t.circle_id = :circle
               and (cast(:kind as text) is null or t.kind = :kind)
               and (cast(:place as text) is null or t.place = :place)
               and (cast(:words as text) is null or t.title ilike :words)
               and (cast(:at as timestamptz) is null or (t.updated_at, t.id) < (cast(:at as timestamptz), cast(:id as uuid)))
               and\s""" + Rules.sees("t", ":me")
                        + " order by t.updated_at desc, t.id desc limit :limit")
                .param("circle", circleId)
                .param("me", me)
                .param("kind", kind == null ? null : kind.code())
                .param("place", place == null ? null : place.code())
                .param("words", words == null || words.isBlank() ? null : Sql.anywhere(words.trim()))
                .param("at", page.first() ? null : Sql.timestamp(page.instant(0)))
                .param("id", page.first() ? null : page.uuid(1).toString())
                .param("limit", page.fetch())
                .query(ThingStore::row)
                .list();
    }

    /** How many things in a circle only this person can see: what "Just me" counts. */
    public int onlyMine(UUID me) {
        return jdbc.sql("""
            select count(*) from things t join members m on m.id = t.owner_id and m.user_id = :me and m.status = 'joined'
            where t.audience = 'me'
            """).param("me", me).query(Integer.class).single();
    }
}
