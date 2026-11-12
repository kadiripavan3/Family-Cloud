package app.homeport.api.library;

import app.homeport.api.common.Keyset;
import app.homeport.api.common.Rules;
import app.homeport.api.common.Sql;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Reads and writes albums and what is in them. Who may see an album is decided by the thing it is, and what
 * is in it is counted and shown one viewer at a time: only what that person may see.
 */
@Repository
public class AlbumStore {

    public record AlbumRow(
            UUID thingId, String note, AlbumOrigin origin, UUID personId, boolean folder, UUID coverItemId) {}

    /** An album with the thing it is, as one viewer sees it. */
    public record Album(ThingRow thing, AlbumRow details) {}

    public record Holding(UUID id, String title) {}

    /**
     * What one member added to one album, as far as the viewer may see it.
     *
     * @param fresh how many of them arrived in the last days from someone other than the viewer
     */
    public record Share(UUID albumId, UUID addedBy, int count, int fresh, LocalDateTime newestTaken, UUID newestId) {}

    public record TabCounts(int shared, int mine, int journey) {}

    private static final String DETAILS = ", a.note, a.origin, a.person_id, a.folder, a.cover_item_id ";
    private static final String SEES = Rules.sees("t", ":me");

    private final JdbcClient jdbc;

    AlbumStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static AlbumRow details(ResultSet rs, String id) throws SQLException {
        return new AlbumRow(
                rs.getObject(id, UUID.class),
                rs.getString("note"),
                AlbumOrigin.read(rs.getString("origin")),
                rs.getObject("person_id", UUID.class),
                rs.getBoolean("folder"),
                rs.getObject("cover_item_id", UUID.class));
    }

    public void insert(UUID thingId, String note, AlbumOrigin origin, UUID personId, boolean folder) {
        jdbc.sql("""
                        insert into albums (thing_id, note, origin, person_id, folder)
                        values (:id, :note, :origin, :person, :folder) on conflict (thing_id) do nothing
                        """)
                .param("id", thingId)
                .param("note", note)
                .param("origin", origin.code())
                .param("person", personId)
                .param("folder", folder)
                .update();
    }

    public Optional<AlbumRow> find(UUID thingId) {
        return jdbc.sql("select a.thing_id" + DETAILS + "from albums a where a.thing_id = :id")
                .param("id", thingId)
                .query((rs, n) -> details(rs, "thing_id"))
                .optional();
    }

    public void update(UUID thingId, String note, UUID coverItemId) {
        jdbc.sql("update albums set note = :note, cover_item_id = :cover where thing_id = :id")
                .param("id", thingId)
                .param("note", note)
                .param("cover", coverItemId)
                .update();
    }

    /**
     * Puts things into an album: those of the given ones that are in this circle's Library and that the
     * person may see. Returns how many that is; one that was in the album already stays in it once.
     */
    public int add(UUID albumId, UUID circleId, List<UUID> itemIds, UUID addedBy, UUID me) {
        if (itemIds.isEmpty()) {
            return 0;
        }
        String which = " from library_items i join things t on t.id = i.thing_id"
                + " where i.thing_id in (:ids) and i.circle_id = :circle and " + SEES;
        jdbc.sql(
                        "insert into album_items (album_id, item_id, added_by) select cast(:album as uuid), i.thing_id, cast(:by as uuid)"
                                + which + " on conflict do nothing")
                .param("album", albumId)
                .param("by", addedBy)
                .param("ids", itemIds)
                .param("circle", circleId)
                .param("me", me)
                .update();
        return jdbc.sql("select count(*)" + which)
                .param("ids", itemIds)
                .param("circle", circleId)
                .param("me", me)
                .query(Integer.class)
                .single();
    }

    public void remove(UUID albumId, UUID itemId) {
        jdbc.sql("delete from album_items where album_id = :album and item_id = :item")
                .param("album", albumId)
                .param("item", itemId)
                .update();
    }

    /**
     * The albums of a circle the viewer may see, last changed first, a page at a time.
     *
     * @param tab which of the three tabs, or null for all of them
     * @param folder true for folders of files, false for albums of photos
     */
    public List<Album> list(UUID circleId, UUID me, AlbumTab tab, boolean folder, Keyset page) {
        String which = tab == null
                ? ""
                : switch (tab) {
                    case SHARED -> " and t.audience <> 'me' and a.origin <> 'journey'";
                    case MINE -> " and t.audience = 'me' and a.origin <> 'journey'";
                    case JOURNEY -> " and a.origin = 'journey'";
                };
        return jdbc.sql("select " + ThingStore.COLUMNS + DETAILS + "from albums a join things t on t.id = a.thing_id"
                        + " where t.circle_id = :circle and t.place = 'library' and a.folder = :folder" + which
                        + " and (cast(:at as timestamptz) is null"
                        + " or (t.updated_at, t.id) < (cast(:at as timestamptz), cast(:id as uuid)))"
                        + " and " + SEES + " order by t.updated_at desc, t.id desc limit :limit")
                .param("circle", circleId)
                .param("me", me)
                .param("folder", folder)
                .param("at", page.first() ? null : Sql.timestamp(page.instant(0)))
                .param("id", page.first() ? null : page.uuid(1).toString())
                .param("limit", page.fetch())
                .query((rs, n) -> new Album(ThingStore.row(rs, n), details(rs, "id")))
                .list();
    }

    /** How many albums of photos the viewer sees under each of the three tabs. */
    public TabCounts tabCounts(UUID circleId, UUID me) {
        return jdbc.sql("""
                        select count(*) filter (where t.audience <> 'me' and a.origin <> 'journey') as shared,
                          count(*) filter (where t.audience = 'me' and a.origin <> 'journey') as mine,
                          count(*) filter (where a.origin = 'journey') as journey
                        from albums a join things t on t.id = a.thing_id
                        where t.circle_id = :circle and t.place = 'library' and not a.folder and\s""" + SEES)
                .param("circle", circleId)
                .param("me", me)
                .query((rs, n) -> new TabCounts(rs.getInt("shared"), rs.getInt("mine"), rs.getInt("journey")))
                .single();
    }

    /**
     * What is in these albums for one viewer, by who added it: how many, how many of them are new, and the
     * newest. An album made by hand counts what was put into it; one that fills itself counts every photo and
     * video its person is in.
     *
     * @param mine the viewer's own member, whose additions are not news to them
     */
    public List<Share> shares(List<UUID> albumIds, UUID me, UUID mine, int freshDays) {
        if (albumIds.isEmpty()) {
            return List.of();
        }
        String newest = " max(i.taken_local) as newest_taken,"
                + " (array_agg(i.thing_id order by i.taken_local desc, i.thing_id desc))[1] as newest_id";
        return jdbc.sql("select ai.album_id, coalesce(i.added_by, t.owner_id) as added_by, count(*) as n,"
                        + " count(*) filter (where ai.added_at > now() - make_interval(days => :days)"
                        + " and ai.added_by is distinct from :mine) as fresh," + newest
                        + " from album_items ai join library_items i on i.thing_id = ai.item_id"
                        + " join things t on t.id = i.thing_id where ai.album_id in (:albums) and " + SEES
                        + " group by ai.album_id, coalesce(i.added_by, t.owner_id)"
                        + " union all"
                        + " select a.thing_id, coalesce(i.added_by, t.owner_id), count(*),"
                        + " count(*) filter (where i.created_at > now() - make_interval(days => :days)"
                        + " and t.owner_id <> :mine)," + newest
                        + " from albums a join things al on al.id = a.thing_id"
                        + " join thing_about ab on ab.member_id = a.person_id"
                        + " join library_items i on i.thing_id = ab.thing_id and i.kind in ('photo', 'video')"
                        + " and i.circle_id = al.circle_id join things t on t.id = i.thing_id"
                        + " where a.thing_id in (:albums) and a.origin = 'person' and " + SEES
                        + " group by a.thing_id, coalesce(i.added_by, t.owner_id)")
                .param("albums", albumIds)
                .param("me", me)
                .param("mine", mine)
                .param("days", freshDays)
                .query((rs, n) -> new Share(
                        rs.getObject("album_id", UUID.class),
                        rs.getObject("added_by", UUID.class),
                        rs.getInt("n"),
                        rs.getInt("fresh"),
                        rs.getObject("newest_taken", LocalDateTime.class),
                        rs.getObject("newest_id", UUID.class)))
                .list();
    }

    /**
     * The albums one photo, video or document is in, as far as the viewer may see them: the ones it was put
     * into, and the ones that fill themselves for someone who is in it. Fifty at most.
     */
    public List<Holding> holding(UUID itemId, UUID me) {
        return jdbc.sql("""
                        select t.id, t.title from albums a join things t on t.id = a.thing_id
                        join library_items li on li.thing_id = :item and li.circle_id = t.circle_id
                        where (exists (select 1 from album_items ai where ai.album_id = a.thing_id and ai.item_id = :item)
                               or (a.origin = 'person' and li.kind in ('photo', 'video')
                                   and exists (select 1 from thing_about ab where ab.thing_id = :item
                                               and ab.member_id = a.person_id)))
                          and\s""" + SEES + " order by t.title, t.id limit 50")
                .param("item", itemId)
                .param("me", me)
                .query((rs, n) -> new Holding(rs.getObject("id", UUID.class), rs.getString("title")))
                .list();
    }

    /** The pictures of an album that everyone in its circle may see, the newest first: what a guest is shown. */
    public List<UUID> forEveryone(UUID albumId, int limit) {
        return jdbc.sql("""
                        select i.thing_id from albums a join things al on al.id = a.thing_id
                        join library_items i on i.circle_id = al.circle_id and i.kind = 'photo'
                        join things t on t.id = i.thing_id and t.audience = 'circle'
                        where a.thing_id = :album
                          and not exists (select 1 from thing_hides h where h.thing_id = t.id)
                          and (exists (select 1 from album_items ai where ai.album_id = a.thing_id and ai.item_id = i.thing_id)
                               or (a.origin = 'person' and exists (select 1 from thing_about ab
                                     where ab.thing_id = i.thing_id and ab.member_id = a.person_id)))
                        order by i.taken_local desc, i.thing_id desc limit :limit
                        """)
                .param("album", albumId)
                .param("limit", limit)
                .query(UUID.class)
                .list();
    }
}
