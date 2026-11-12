package app.homeport.api.library;

import app.homeport.api.common.Keyset;
import app.homeport.api.common.Rules;
import app.homeport.api.common.Sql;
import app.homeport.api.library.Moments.Shot;
import app.homeport.api.media.MediaKind;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Reads and writes photos, videos and documents. Who may read one is decided by the thing it is: every query
 * here that reads for someone joins {@code things t} and asks {@link Rules#sees}.
 */
@Repository
public class LibraryStore {

    /**
     * A photo, video or document as one viewer sees it, with what is known of its file.
     *
     * @param addedBy the member it was added for: its owner, or the child whose tablet it came from
     * @param pictureKey where its picture is kept in three sizes: the photo itself, or a video's still; null
     *     for a file with no picture
     * @param fileKey where the file itself is: a photo's original, the video, the document
     * @param storedBytes what is kept for it in all: the file, its original, its still
     */
    public record Item(
            ThingRow thing,
            UUID mediaId,
            UUID addedBy,
            Instant takenAt,
            LocalDateTime takenLocal,
            LocalDate day,
            Double lat,
            Double lng,
            String placeName,
            String country,
            String contentHash,
            String pictureKey,
            String fullKey,
            String fileKey,
            MediaKind mediaKind,
            String contentType,
            String fileName,
            Integer width,
            Integer height,
            Integer durationS,
            long storedBytes,
            Instant addedAt,
            boolean loved) {

        public UUID id() {
            return thing.id();
        }
    }

    /**
     * Which of a circle's photos, videos and documents are wanted. Every part that is set narrows it further.
     *
     * @param kinds the kinds of thing, as their codes; never empty
     * @param lovedBy only what this member gave a heart
     * @param by only what was added by this member
     * @param about only what every one of these members is in
     * @param place only what was taken at the place with this name
     * @param album only what was put into this album by hand
     * @param span only what was taken from one shot to another, both included: a moment
     * @param category only documents of this kind
     * @param words only what has these words in its name or, for a document, inside it
     * @param loose only what is in no folder the viewer can see
     * @param nothing true when nothing can match (an album filling itself for someone who is gone)
     */
    public record Filter(
            List<String> kinds,
            UUID lovedBy,
            UUID by,
            List<UUID> about,
            String place,
            UUID album,
            Span span,
            DocumentCategory category,
            String words,
            boolean loose,
            boolean nothing) {

        public static Filter of(List<ThingKind> kinds) {
            return new Filter(
                    kinds.stream().map(ThingKind::code).toList(),
                    null,
                    null,
                    List.of(),
                    null,
                    null,
                    null,
                    null,
                    null,
                    false,
                    false);
        }
    }

    public record Span(LocalDateTime from, UUID fromId, LocalDateTime to, UUID toId) {}

    /** A photo or video in a small grid: just its picture. */
    public record Tile(UUID id, ThingKind kind, String pictureKey, YearMonth month) {}

    public record MonthCount(YearMonth month, int photos, int videos) {}

    public record PlaceRow(
            String name,
            String country,
            Double lat,
            Double lng,
            int photos,
            int videos,
            int visits,
            LocalDate lastDay,
            UUID coverId,
            List<UUID> people) {}

    public record PersonCount(UUID memberId, int count, UUID coverId) {}

    public record Bytes(ThingKind kind, UUID addedBy, long bytes) {}

    public record Known(String hash, UUID thingId, UUID mediaId) {}

    public record LoveRow(UUID thingId, UUID memberId) {}

    public record CommentRow(UUID id, UUID thingId, UUID memberId, String body, Instant createdAt) {}

    /** A photo or video someone else added lately: which, and the day it counts for. */
    public record Fresh(UUID id, LocalDate day) {}

    public record FreshDocument(
            UUID id, String title, UUID addedBy, DocumentCategory category, String pictureKey, boolean scan) {}

    private static final String ITEM = "select " + ThingStore.COLUMNS + """
        , i.media_id, coalesce(i.added_by, t.owner_id) as added_by, i.taken_at, i.taken_local, i.day, i.lat, i.lng,
        i.place_name, i.country, i.content_hash, i.created_at as added_at, f.storage_key, f.has_sizes, f.original_key,
        f.kind as media_kind, f.content_type, f.file_name, f.width, f.height, f.duration_s,
        coalesce(f.bytes, 0) + coalesce(f.original_bytes, 0) + coalesce(p.bytes, 0) + coalesce(p.original_bytes, 0)
          as stored_bytes,
        p.storage_key as poster_key,
        exists (select 1 from library_loves lv where lv.thing_id = i.thing_id and lv.member_id = :mine) as loved
        from library_items i join things t on t.id = i.thing_id join media f on f.id = i.media_id
        left join media p on p.id = i.poster_media_id and p.status = 'ready' and p.has_sizes
        """;

    private static final String FROM = " from library_items i join things t on t.id = i.thing_id ";

    private static final String SEES = Rules.sees("t", ":me");

    private final JdbcClient jdbc;

    LibraryStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static Item item(ResultSet rs, int n) throws SQLException {
        boolean hasSizes = rs.getBoolean("has_sizes");
        String key = rs.getString("storage_key");
        String original = rs.getString("original_key");
        return new Item(
                ThingStore.row(rs, n),
                rs.getObject("media_id", UUID.class),
                rs.getObject("added_by", UUID.class),
                Sql.instant(rs, "taken_at"),
                rs.getObject("taken_local", LocalDateTime.class),
                rs.getObject("day", LocalDate.class),
                (Double) rs.getObject("lat"),
                (Double) rs.getObject("lng"),
                rs.getString("place_name"),
                rs.getString("country"),
                rs.getString("content_hash"),
                hasSizes ? key : rs.getString("poster_key"),
                hasSizes ? key : null,
                original != null ? original : key,
                MediaKind.read(rs.getString("media_kind")),
                rs.getString("content_type"),
                rs.getString("file_name"),
                (Integer) rs.getObject("width"),
                (Integer) rs.getObject("height"),
                (Integer) rs.getObject("duration_s"),
                rs.getLong("stored_bytes"),
                Sql.instant(rs, "added_at"),
                rs.getBoolean("loved"));
    }

    /** Adds the filter's conditions to a query over {@code library_items i} and {@code things t}. */
    private static String narrow(Filter filter, Map<String, Object> params) {
        StringBuilder sql = new StringBuilder(" and i.kind in (:kinds)");
        params.put("kinds", filter.kinds());
        if (filter.nothing()) {
            sql.append(" and false");
        }
        if (filter.lovedBy() != null) {
            sql.append(" and exists (select 1 from library_loves fl where fl.thing_id = i.thing_id"
                    + " and fl.member_id = :lovedBy)");
            params.put("lovedBy", filter.lovedBy());
        }
        if (filter.by() != null) {
            sql.append(" and coalesce(i.added_by, t.owner_id) = :by");
            params.put("by", filter.by());
        }
        for (int n = 0; n < filter.about().size(); n++) {
            sql.append(
                            " and exists (select 1 from thing_about fa where fa.thing_id = i.thing_id and fa.member_id = :about")
                    .append(n)
                    .append(")");
            params.put("about" + n, filter.about().get(n));
        }
        if (filter.place() != null) {
            sql.append(" and lower(i.place_name) = lower(:place)");
            params.put("place", filter.place());
        }
        if (filter.album() != null) {
            sql.append(
                    " and exists (select 1 from album_items fi where fi.album_id = :album and fi.item_id = i.thing_id)");
            params.put("album", filter.album());
        }
        if (filter.span() != null) {
            sql.append(" and (i.taken_local, i.thing_id) >= (cast(:spanFrom as timestamp), cast(:spanFromId as uuid))"
                    + " and (i.taken_local, i.thing_id) <= (cast(:spanTo as timestamp), cast(:spanToId as uuid))");
            params.put("spanFrom", filter.span().from());
            params.put("spanFromId", filter.span().fromId());
            params.put("spanTo", filter.span().to());
            params.put("spanToId", filter.span().toId());
        }
        if (filter.category() != null) {
            sql.append(
                    " and exists (select 1 from documents fd where fd.thing_id = i.thing_id and fd.category = :category)");
            params.put("category", filter.category().code());
        }
        if (filter.words() != null) {
            sql.append(" and (t.title ilike :words or exists (select 1 from documents fw where fw.thing_id = i.thing_id"
                    + " and fw.text ilike :words))");
            params.put("words", Sql.anywhere(filter.words()));
        }
        if (filter.loose()) {
            sql.append(
                            " and not exists (select 1 from album_items fo join albums fa2 on fa2.thing_id = fo.album_id"
                                    + " and fa2.folder join things ft on ft.id = fa2.thing_id where fo.item_id = i.thing_id and ")
                    .append(Rules.sees("ft", ":me"))
                    .append(")");
        }
        return sql.toString();
    }

    // ---------- reading ----------

    /**
     * What the viewer may see of a circle's Library, the newest taken first, a page at a time.
     *
     * @param mine the viewer's own member in the circle, for their hearts
     * @param before only what was taken before this moment on the clock where it was taken, to jump down the
     *     years; null to start at the top
     */
    public List<Item> wall(UUID circleId, UUID me, UUID mine, Filter filter, LocalDateTime before, Keyset page) {
        Map<String, Object> params = new HashMap<>();
        StringBuilder sql =
                new StringBuilder(ITEM).append(" where i.circle_id = :circle").append(narrow(filter, params));
        if (before != null) {
            sql.append(" and i.taken_local < cast(:before as timestamp)");
            params.put("before", before);
        }
        if (!page.first()) {
            sql.append(" and (i.taken_local, i.thing_id) < (cast(:at as timestamp), cast(:after as uuid))");
            params.put("at", localTime(page, 0));
            params.put("after", page.uuid(1));
        }
        sql.append(" and ").append(SEES).append(" order by i.taken_local desc, i.thing_id desc limit :limit");
        return jdbc.sql(sql.toString())
                .params(params)
                .param("circle", circleId)
                .param("me", me)
                .param("mine", mine)
                .param("limit", page.fetch())
                .query(LibraryStore::item)
                .list();
    }

    private static LocalDateTime localTime(Keyset page, int index) {
        try {
            return LocalDateTime.parse(page.text(index));
        } catch (java.time.format.DateTimeParseException notATime) {
            throw Keyset.badCursor();
        }
    }

    public Optional<Item> item(UUID id, UUID me, UUID mine) {
        return items(List.of(id), me, mine).stream().findFirst();
    }

    /** These photos, videos and documents, as far as the viewer may see them. In no particular order. */
    public List<Item> items(List<UUID> ids, UUID me, UUID mine) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(ITEM + " where i.thing_id in (:ids) and " + SEES)
                .param("ids", ids)
                .param("me", me)
                .param("mine", mine)
                .query(LibraryStore::item)
                .list();
    }

    /**
     * The viewer's own photos and videos (the ones they own in this circle) taken between two moments, the
     * oldest first: where the original of a picture that comes home from Journey is looked for.
     */
    public List<Item> ownTakenBetween(UUID circleId, UUID me, UUID mine, Instant from, Instant to, int limit) {
        // The wall's index is by the clock where a photo was taken, which is never more than a day away from
        // the moment itself: the wide range finds the rows, the exact one decides.
        return jdbc.sql(ITEM + """
             where i.circle_id = :circle and t.owner_id = :mine and i.kind in ('photo', 'video')
               and i.taken_local between (cast(:from as timestamptz) at time zone 'UTC') - interval '1 day'
                                     and (cast(:to as timestamptz) at time zone 'UTC') + interval '1 day'
               and i.taken_at between cast(:from as timestamptz) and cast(:to as timestamptz)
             order by i.taken_at, i.thing_id limit :limit
            """)
                .param("circle", circleId)
                .param("me", me)
                .param("mine", mine)
                .param("from", Sql.timestamp(from))
                .param("to", Sql.timestamp(to))
                .param("limit", limit)
                .query(LibraryStore::item)
                .list();
    }

    /**
     * What stands next to one item in the wall's order under the same filter: a few taken after it (the nearest
     * first) or a few taken before it (the nearest first).
     */
    public List<Item> beside(UUID circleId, UUID me, UUID mine, Filter filter, Item item, boolean newer, int limit) {
        Map<String, Object> params = new HashMap<>();
        String sql = ITEM + " where i.circle_id = :circle" + narrow(filter, params)
                + " and (i.taken_local, i.thing_id) " + (newer ? ">" : "<")
                + " (cast(:at as timestamp), cast(:id as uuid)) and " + SEES
                + (newer
                        ? " order by i.taken_local, i.thing_id limit :limit"
                        : " order by i.taken_local desc, i.thing_id desc limit :limit");
        return jdbc.sql(sql)
                .params(params)
                .param("circle", circleId)
                .param("me", me)
                .param("mine", mine)
                .param("at", item.takenLocal())
                .param("id", item.id())
                .param("limit", limit)
                .query(LibraryStore::item)
                .list();
    }

    public record Position(int newer, int total) {}

    /** How many things the filter holds for the viewer, and how many of them were taken after this one. */
    public Position position(UUID circleId, UUID me, Filter filter, Item item) {
        Map<String, Object> params = new HashMap<>();
        return jdbc.sql("select count(*) as total, count(*) filter (where (i.taken_local, i.thing_id) >"
                        + " (cast(:at as timestamp), cast(:id as uuid))) as newer" + FROM
                        + "where i.circle_id = :circle"
                        + narrow(filter, params) + " and " + SEES)
                .params(params)
                .param("circle", circleId)
                .param("me", me)
                .param("at", item.takenLocal())
                .param("id", item.id())
                .query((rs, n) -> new Position(rs.getInt("newer"), rs.getInt("total")))
                .single();
    }

    /** Every photo and video the viewer may see that counts for one of these days, as the moments rule wants them. */
    public List<Shot> shots(UUID circleId, UUID me, List<LocalDate> days) {
        if (days.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("select i.thing_id, i.taken_local, i.lat, i.lng, i.place_name,"
                        + " coalesce(i.added_by, t.owner_id) as added_by, i.kind as item_kind, t.audience" + FROM
                        + "where i.circle_id = :circle and i.day in (:days) and i.kind in ('photo', 'video') and "
                        + SEES)
                .param("circle", circleId)
                .param("days", days)
                .param("me", me)
                .query((rs, n) -> new Shot(
                        rs.getObject("thing_id", UUID.class),
                        rs.getObject("taken_local", LocalDateTime.class),
                        (Double) rs.getObject("lat"),
                        (Double) rs.getObject("lng"),
                        rs.getString("place_name"),
                        rs.getObject("added_by", UUID.class),
                        rs.getString("item_kind").equals("video"),
                        Audience.read(rs.getString("audience"))))
                .list();
    }

    // ---------- the strip at the side ----------

    /** How many photos and videos the filter holds in each month, the newest month first. One row per month with any. */
    public List<MonthCount> months(UUID circleId, UUID me, Filter filter) {
        Map<String, Object> params = new HashMap<>();
        return jdbc.sql("select date_trunc('month', i.taken_local) as month,"
                        + " count(*) filter (where i.kind = 'photo') as photos,"
                        + " count(*) filter (where i.kind = 'video') as videos" + FROM + "where i.circle_id = :circle"
                        + narrow(filter, params) + " and " + SEES + " group by 1 order by 1 desc")
                .params(params)
                .param("circle", circleId)
                .param("me", me)
                .query((rs, n) -> new MonthCount(
                        YearMonth.from(rs.getObject("month", LocalDateTime.class)),
                        rs.getInt("photos"),
                        rs.getInt("videos")))
                .list();
    }

    /** The newest few pictures of each month of one year, for the small grids of the year's view. */
    public List<Tile> tiles(UUID circleId, UUID me, Filter filter, int year, int perMonth) {
        Map<String, Object> params = new HashMap<>();
        return jdbc.sql("""
                        select x.thing_id, x.item_kind, x.month, x.storage_key, x.has_sizes, x.poster_key from (
                          select i.thing_id, i.kind as item_kind, date_trunc('month', i.taken_local) as month, f.storage_key,
                            f.has_sizes, p.storage_key as poster_key, i.taken_local,
                            row_number() over (partition by date_trunc('month', i.taken_local)
                                               order by i.taken_local desc, i.thing_id desc) as place
                          from library_items i join things t on t.id = i.thing_id join media f on f.id = i.media_id
                          left join media p on p.id = i.poster_media_id and p.status = 'ready' and p.has_sizes
                          where i.circle_id = :circle and i.taken_local >= cast(:from as timestamp)
                            and i.taken_local < cast(:to as timestamp)""" + narrow(filter, params) + " and " + SEES
                        + ") x where x.place <= :perMonth order by x.month desc, x.taken_local desc, x.thing_id desc")
                .params(params)
                .param("circle", circleId)
                .param("me", me)
                .param("from", LocalDate.of(year, 1, 1).atStartOfDay())
                .param("to", LocalDate.of(year + 1, 1, 1).atStartOfDay())
                .param("perMonth", perMonth)
                .query((rs, n) -> new Tile(
                        rs.getObject("thing_id", UUID.class),
                        ThingKind.read(rs.getString("item_kind")),
                        rs.getBoolean("has_sizes") ? rs.getString("storage_key") : rs.getString("poster_key"),
                        YearMonth.from(rs.getObject("month", LocalDateTime.class))))
                .list();
    }

    // ---------- the lenses ----------

    /** How many things of each kind the viewer may see in a circle's Library. */
    public Map<ThingKind, Integer> counts(UUID circleId, UUID me) {
        Map<ThingKind, Integer> counts = new HashMap<>();
        jdbc.sql("select i.kind as item_kind, count(*) as n" + FROM + "where i.circle_id = :circle and " + SEES
                        + " group by i.kind")
                .param("circle", circleId)
                .param("me", me)
                .query((rs, n) -> counts.put(ThingKind.read(rs.getString("item_kind")), rs.getInt("n")))
                .list();
        return counts;
    }

    /** The members who are in photos and videos the viewer may see: how many each, and the newest as a cover. */
    public List<PersonCount> people(UUID circleId, UUID me) {
        return jdbc.sql("select ab.member_id, count(*) as n,"
                        + " (array_agg(i.thing_id order by i.taken_local desc, i.thing_id desc))[1] as cover"
                        + " from thing_about ab join library_items i on i.thing_id = ab.thing_id"
                        + " join things t on t.id = i.thing_id"
                        + " where i.circle_id = :circle and i.kind in ('photo', 'video') and " + SEES
                        + " group by ab.member_id order by n desc, ab.member_id")
                .param("circle", circleId)
                .param("me", me)
                .query((rs, n) -> new PersonCount(
                        rs.getObject("member_id", UUID.class), rs.getInt("n"), rs.getObject("cover", UUID.class)))
                .list();
    }

    /**
     * The places photos and videos were taken at, by the name the phone gave them, the one with most first.
     * Five hundred at most.
     */
    public List<PlaceRow> places(UUID circleId, UUID me) {
        return jdbc.sql("""
                        select (array_agg(i.place_name order by i.taken_local desc))[1] as name, max(i.country) as country,
                          avg(i.lat) as lat, avg(i.lng) as lng,
                          count(*) filter (where i.kind = 'photo') as photos,
                          count(*) filter (where i.kind = 'video') as videos,
                          count(distinct i.day) as visits, max(i.day) as last_day,
                          (array_agg(i.thing_id order by i.taken_local desc, i.thing_id desc))[1] as cover,
                          array_agg(distinct coalesce(i.added_by, t.owner_id)) as people
                        from library_items i join things t on t.id = i.thing_id
                        where i.circle_id = :circle and i.place_name is not null and i.kind in ('photo', 'video') and\s"""
                        + SEES + " group by lower(i.place_name) order by count(*) desc, lower(i.place_name) limit 500")
                .param("circle", circleId)
                .param("me", me)
                .query((rs, n) -> new PlaceRow(
                        rs.getString("name"),
                        rs.getString("country"),
                        (Double) rs.getObject("lat"),
                        (Double) rs.getObject("lng"),
                        rs.getInt("photos"),
                        rs.getInt("videos"),
                        rs.getInt("visits"),
                        rs.getObject("last_day", LocalDate.class),
                        rs.getObject("cover", UUID.class),
                        List.of((UUID[]) rs.getArray("people").getArray())))
                .list();
    }

    /**
     * What a circle keeps, in bytes, by kind of thing and by who added it. This counts everything in the
     * circle, also what the person asking can't see: it is the size of what is kept, and says nothing of what
     * it is.
     */
    public List<Bytes> bytes(UUID circleId) {
        return jdbc.sql("""
                        select i.kind as item_kind, coalesce(i.added_by, t.owner_id) as added_by,
                          sum(coalesce(f.bytes, 0) + coalesce(f.original_bytes, 0) + coalesce(p.bytes, 0)
                              + coalesce(p.original_bytes, 0)) as bytes
                        from library_items i join things t on t.id = i.thing_id join media f on f.id = i.media_id
                        left join media p on p.id = i.poster_media_id
                        where i.circle_id = :circle group by 1, 2
                        """)
                .param("circle", circleId)
                .query((rs, n) -> new Bytes(
                        ThingKind.read(rs.getString("item_kind")),
                        rs.getObject("added_by", UUID.class),
                        rs.getLong("bytes")))
                .list();
    }

    /** What the pictures of a circle and of its people take: kept for the circle, though not in its Library. */
    public long otherBytes(UUID circleId) {
        return jdbc.sql("""
                        select coalesce(sum(m.bytes), 0) from media m where m.id in (
                          select avatar_media_id from members where circle_id = :circle and status <> 'left'
                          union select cover_media_id from circles where id = :circle)
                        """).param("circle", circleId).query(Long.class).single();
    }

    // ---------- adding ----------

    /** Which of these fingerprints this member already has in this circle's Library. */
    public List<Known> known(UUID circleId, UUID ownerMemberId, List<String> hashes) {
        if (hashes.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("select distinct on (i.content_hash) i.content_hash, i.thing_id, i.media_id" + FROM
                        + "where i.circle_id = :circle and t.owner_id = :owner and i.content_hash in (:hashes)"
                        + " order by i.content_hash, i.created_at")
                .param("circle", circleId)
                .param("owner", ownerMemberId)
                .param("hashes", hashes)
                .query((rs, n) -> new Known(
                        rs.getString("content_hash"),
                        rs.getObject("thing_id", UUID.class),
                        rs.getObject("media_id", UUID.class)))
                .list();
    }

    /** The thing an upload already belongs to, if it was put in the Library before. */
    public Optional<UUID> ofMedia(UUID mediaId) {
        return jdbc.sql("select thing_id from library_items where media_id = :media")
                .param("media", mediaId)
                .query(UUID.class)
                .optional();
    }

    public void insert(
            UUID thingId,
            UUID circleId,
            ThingKind kind,
            UUID mediaId,
            UUID posterMediaId,
            UUID addedBy,
            Instant takenAt,
            LocalDateTime takenLocal,
            Double lat,
            Double lng,
            String placeName,
            String country,
            String contentHash) {
        jdbc.sql("""
                        insert into library_items (thing_id, circle_id, kind, media_id, poster_media_id, added_by, taken_at,
                          taken_local, day, lat, lng, place_name, country, content_hash)
                        values (:id, :circle, :kind, :media, :poster, :by, :takenAt, cast(:takenLocal as timestamp), :day, :lat,
                          :lng, :place, :country, :hash)
                        on conflict (thing_id) do nothing
                        """)
                .param("id", thingId)
                .param("circle", circleId)
                .param("kind", kind.code())
                .param("media", mediaId)
                .param("poster", posterMediaId)
                .param("by", addedBy)
                .param("takenAt", Sql.timestamp(takenAt))
                .param("takenLocal", takenLocal)
                .param("day", Moments.dayOf(takenLocal))
                .param("lat", lat, java.sql.Types.DOUBLE)
                .param("lng", lng, java.sql.Types.DOUBLE)
                .param("place", placeName)
                .param("country", country)
                .param("hash", contentHash)
                .update();
    }

    /** Changes when and where something was taken. */
    public void retake(
            UUID thingId,
            Instant takenAt,
            LocalDateTime takenLocal,
            Double lat,
            Double lng,
            String placeName,
            String country) {
        jdbc.sql("""
                        update library_items set taken_at = :takenAt, taken_local = cast(:takenLocal as timestamp), day = :day,
                          lat = :lat, lng = :lng, place_name = :place, country = :country where thing_id = :id
                        """)
                .param("id", thingId)
                .param("takenAt", Sql.timestamp(takenAt))
                .param("takenLocal", takenLocal)
                .param("day", Moments.dayOf(takenLocal))
                .param("lat", lat, java.sql.Types.DOUBLE)
                .param("lng", lng, java.sql.Types.DOUBLE)
                .param("place", placeName)
                .param("country", country)
                .update();
    }

    // ---------- who is in it, hearts, comments ----------

    /** The members each of these things is about. */
    public Map<UUID, List<UUID>> about(List<UUID> thingIds) {
        Map<UUID, List<UUID>> about = new HashMap<>();
        if (thingIds.isEmpty()) {
            return about;
        }
        jdbc.sql("select thing_id, member_id from thing_about where thing_id in (:ids)")
                .param("ids", thingIds)
                .query((rs, n) -> about.computeIfAbsent(rs.getObject("thing_id", UUID.class), k -> new ArrayList<>())
                        .add(rs.getObject("member_id", UUID.class)))
                .list();
        return about;
    }

    public void love(UUID thingId, UUID memberId) {
        jdbc.sql("insert into library_loves (thing_id, member_id) values (:thing, :member) on conflict do nothing")
                .param("thing", thingId)
                .param("member", memberId)
                .update();
    }

    public void unlove(UUID thingId, UUID memberId) {
        jdbc.sql("delete from library_loves where thing_id = :thing and member_id = :member")
                .param("thing", thingId)
                .param("member", memberId)
                .update();
    }

    /** Who gave these things a heart, the first heart first. */
    public List<LoveRow> loves(List<UUID> thingIds) {
        if (thingIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("select thing_id, member_id from library_loves where thing_id in (:ids)"
                        + " order by created_at, member_id")
                .param("ids", thingIds)
                .query((rs, n) ->
                        new LoveRow(rs.getObject("thing_id", UUID.class), rs.getObject("member_id", UUID.class)))
                .list();
    }

    /** Adds a comment. Sending the same clientId again adds nothing and returns the one made the first time. */
    public UUID comment(UUID thingId, UUID memberId, String body, UUID clientId) {
        return jdbc.sql("""
                        insert into library_comments (id, thing_id, member_id, body, client_id)
                        values (:id, :thing, :member, :body, :client)
                        on conflict (member_id, client_id) do update set client_id = excluded.client_id
                        returning id
                        """)
                .param("id", UUID.randomUUID())
                .param("thing", thingId)
                .param("member", memberId)
                .param("body", body)
                .param("client", clientId)
                .query(UUID.class)
                .single();
    }

    public Optional<CommentRow> findComment(UUID id) {
        return jdbc.sql("select id, thing_id, member_id, body, created_at from library_comments where id = :id")
                .param("id", id)
                .query(LibraryStore::comment)
                .optional();
    }

    /** The comments under one thing, the oldest first, a page at a time. */
    public List<CommentRow> comments(UUID thingId, Keyset page) {
        return jdbc.sql("""
                        select id, thing_id, member_id, body, created_at from library_comments where thing_id = :thing
                          and (cast(:at as timestamptz) is null or (created_at, id) > (cast(:at as timestamptz), cast(:id as uuid)))
                        order by created_at, id limit :limit
                        """)
                .param("thing", thingId)
                .param("at", page.first() ? null : Sql.timestamp(page.instant(0)))
                .param("id", page.first() ? null : page.uuid(1).toString())
                .param("limit", page.fetch())
                .query(LibraryStore::comment)
                .list();
    }

    private static CommentRow comment(ResultSet rs, int n) throws SQLException {
        return new CommentRow(
                rs.getObject("id", UUID.class),
                rs.getObject("thing_id", UUID.class),
                rs.getObject("member_id", UUID.class),
                rs.getString("body"),
                Sql.instant(rs, "created_at"));
    }

    public int countComments(UUID thingId) {
        return jdbc.sql("select count(*) from library_comments where thing_id = :thing")
                .param("thing", thingId)
                .query(Integer.class)
                .single();
    }

    public void deleteComment(UUID id) {
        jdbc.sql("delete from library_comments where id = :id").param("id", id).update();
    }

    // ---------- what is new ----------

    /** The photos and videos other people added in the last days that the viewer may see, the latest first. */
    public List<Fresh> fresh(UUID circleId, UUID me, UUID mine, int days, int limit) {
        return jdbc.sql("select i.thing_id, i.day" + FROM
                        + "where i.circle_id = :circle and i.created_at > now() - make_interval(days => :days)"
                        + " and t.owner_id <> :mine and i.kind in ('photo', 'video') and " + SEES
                        + " order by i.created_at desc, i.thing_id limit :limit")
                .param("circle", circleId)
                .param("me", me)
                .param("mine", mine)
                .param("days", days)
                .param("limit", limit)
                .query((rs, n) -> new Fresh(rs.getObject("thing_id", UUID.class), rs.getObject("day", LocalDate.class)))
                .list();
    }

    /** The documents other people added in the last days that the viewer may see, the latest first. */
    public List<FreshDocument> freshDocuments(UUID circleId, UUID me, UUID mine, int days, int limit) {
        return jdbc.sql("select i.thing_id, t.title, coalesce(i.added_by, t.owner_id) as added_by, d.category,"
                        + " f.storage_key, f.has_sizes, f.content_type" + FROM
                        + "join documents d on d.thing_id = i.thing_id join media f on f.id = i.media_id"
                        + " where i.circle_id = :circle and i.created_at > now() - make_interval(days => :days)"
                        + " and t.owner_id <> :mine and i.kind = 'document' and " + SEES
                        + " order by i.created_at desc, i.thing_id limit :limit")
                .param("circle", circleId)
                .param("me", me)
                .param("mine", mine)
                .param("days", days)
                .param("limit", limit)
                .query((rs, n) -> new FreshDocument(
                        rs.getObject("thing_id", UUID.class),
                        rs.getString("title"),
                        rs.getObject("added_by", UUID.class),
                        DocumentCategory.read(rs.getString("category")),
                        rs.getBoolean("has_sizes") ? rs.getString("storage_key") : null,
                        rs.getString("content_type").startsWith("image/")))
                .list();
    }

    /** The pictures of these things, whoever asks: for a guest's page, after the pass has said which things. */
    public Map<UUID, String> pictureKeys(List<UUID> thingIds) {
        Map<UUID, String> keys = new HashMap<>();
        if (thingIds.isEmpty()) {
            return keys;
        }
        jdbc.sql("select i.thing_id, f.storage_key from library_items i join media f on f.id = i.media_id"
                        + " where i.thing_id in (:ids) and f.has_sizes and f.status = 'ready'")
                .param("ids", thingIds)
                .query((rs, n) -> keys.put(rs.getObject("thing_id", UUID.class), rs.getString("storage_key")))
                .list();
        return keys;
    }
}
