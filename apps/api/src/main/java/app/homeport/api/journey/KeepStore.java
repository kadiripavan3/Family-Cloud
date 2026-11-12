package app.homeport.api.journey;

import app.homeport.api.common.Keyset;
import app.homeport.api.common.Rules;
import app.homeport.api.common.Sql;
import app.homeport.api.journey.JourneyPort.JourneyBrief;
import app.homeport.api.media.MediaKind;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Reads and writes what was kept of journeys: which journey became which page and album, and which of its
 * days, entries and photos are home already. Who may see a kept journey is decided by the page and the album
 * it became, with the one rule for things.
 */
@Repository
class KeepStore {

    record KeptRow(
            UUID id,
            UUID circleId,
            UUID keptBy,
            UUID journeyId,
            UUID pageId,
            UUID albumId,
            UUID coverMediaId,
            String title,
            String byline,
            JourneyVisibility visibility,
            JourneyStatus status,
            LocalDate startsOn,
            LocalDate endsOn,
            int days,
            int entries,
            int photos,
            int clips,
            int places,
            int followers,
            String openUrl,
            boolean withBook,
            boolean withOriginals,
            boolean withRoute,
            boolean withWords,
            int bookShots,
            boolean bookDayWords,
            int matched,
            int brought,
            int leftBehind,
            Instant keptAt,
            Instant syncedAt) {}

    record DayRow(UUID keptId, LocalDate day, int number, String place, UUID headingBlock, int shots) {}

    /** @param block the last block this entry has in the page: what the next entry goes after */
    record EntryRow(
            UUID keptId,
            UUID entryId,
            LocalDate day,
            Instant happenedAt,
            String title,
            String place,
            Double lat,
            Double lng,
            UUID block) {}

    record ShotRow(
            UUID keptId, UUID mediaId, UUID entryId, MediaKind kind, UUID itemId, UUID pageMediaId, boolean matched) {}

    /** What the four switches of "Keep this journey" were set to. */
    record Switches(boolean book, boolean originals, boolean route, boolean words) {}

    /** A day of a kept journey that fell on this day of the year, in an earlier year. */
    record JourneyPastDay(
            UUID keptId,
            UUID pageId,
            UUID entryId,
            LocalDate day,
            int number,
            String title,
            String place,
            UUID pageMediaId,
            UUID itemId) {}

    private static final String SEEN = "(exists (select 1 from things t where t.id = k.page_id and "
            + Rules.sees("t", ":me") + ") or exists (select 1 from things t where t.id = k.album_id and "
            + Rules.sees("t", ":me") + "))";

    private final JdbcClient jdbc;

    KeepStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static KeptRow kept(ResultSet rs, int n) throws SQLException {
        return new KeptRow(
                rs.getObject("id", UUID.class),
                rs.getObject("circle_id", UUID.class),
                rs.getObject("kept_by", UUID.class),
                rs.getObject("journey_id", UUID.class),
                rs.getObject("page_id", UUID.class),
                rs.getObject("album_id", UUID.class),
                rs.getObject("cover_media_id", UUID.class),
                rs.getString("title"),
                rs.getString("byline"),
                JourneyVisibility.read(rs.getString("visibility")),
                JourneyStatus.read(rs.getString("status")),
                rs.getObject("starts_on", LocalDate.class),
                rs.getObject("ends_on", LocalDate.class),
                rs.getInt("days"),
                rs.getInt("entries"),
                rs.getInt("photos"),
                rs.getInt("clips"),
                rs.getInt("places"),
                rs.getInt("followers"),
                rs.getString("open_url"),
                rs.getBoolean("with_book"),
                rs.getBoolean("with_originals"),
                rs.getBoolean("with_route"),
                rs.getBoolean("with_words"),
                rs.getInt("book_shots"),
                rs.getBoolean("book_day_words"),
                rs.getInt("matched"),
                rs.getInt("brought"),
                rs.getInt("left_behind"),
                Sql.instant(rs, "kept_at"),
                Sql.instant(rs, "synced_at"));
    }

    // ---------- the kept journey ----------

    /**
     * The row for this member keeping this journey in this circle: made the first time, found again every time
     * after. That is what makes keeping the same journey twice one kept journey.
     */
    KeptRow claim(UUID circleId, UUID keptBy, UUID journeyId, String title, Switches switches) {
        jdbc.sql("""
            insert into kept_journeys (id, circle_id, kept_by, journey_id, title, with_book, with_originals,
              with_route, with_words)
            values (:id, :circle, :by, :journey, :title, :book, :originals, :route, :words)
            on conflict (kept_by, circle_id, journey_id) do nothing
            """)
                .param("id", UUID.randomUUID())
                .param("circle", circleId)
                .param("by", keptBy)
                .param("journey", journeyId)
                .param("title", title)
                .param("book", switches.book())
                .param("originals", switches.originals())
                .param("route", switches.route())
                .param("words", switches.words())
                .update();
        return mine(circleId, keptBy, journeyId).orElseThrow();
    }

    Optional<KeptRow> mine(UUID circleId, UUID keptBy, UUID journeyId) {
        return jdbc.sql(
                        "select * from kept_journeys where kept_by = :by and circle_id = :circle and journey_id = :journey")
                .param("by", keptBy)
                .param("circle", circleId)
                .param("journey", journeyId)
                .query(KeepStore::kept)
                .optional();
    }

    Optional<KeptRow> find(UUID id) {
        return jdbc.sql("select * from kept_journeys where id = :id")
                .param("id", id)
                .query(KeepStore::kept)
                .optional();
    }

    /** A kept journey, for someone who may see the page or the album it became. */
    Optional<KeptRow> find(UUID id, UUID me) {
        return jdbc.sql("select k.* from kept_journeys k where k.id = :id and " + SEEN)
                .param("id", id)
                .param("me", me)
                .query(KeepStore::kept)
                .optional();
    }

    Optional<KeptRow> ofPage(UUID pageId) {
        return jdbc.sql("select * from kept_journeys where page_id = :page order by kept_at limit 1")
                .param("page", pageId)
                .query(KeepStore::kept)
                .optional();
    }

    /** The kept journeys of a circle that this person may see, the last kept first. */
    List<KeptRow> list(UUID circleId, UUID me, Keyset page) {
        StringBuilder sql =
                new StringBuilder("select k.* from kept_journeys k where k.circle_id = :circle and " + SEEN);
        var query = new java.util.HashMap<String, Object>();
        if (!page.first()) {
            sql.append(" and (k.kept_at, k.id) < (cast(:at as timestamptz), cast(:after as uuid))");
            query.put("at", Sql.timestamp(page.instant(0)));
            query.put("after", page.uuid(1));
        }
        sql.append(" order by k.kept_at desc, k.id desc limit :limit");
        return jdbc.sql(sql.toString())
                .params(query)
                .param("circle", circleId)
                .param("me", me)
                .param("limit", page.fetch())
                .query(KeepStore::kept)
                .list();
    }

    /** What Journey says of it now: its numbers, who wrote it, whether it is still live. */
    void told(UUID id, JourneyBrief journey, String byline, int clips) {
        jdbc.sql("""
            update kept_journeys set title = :title, byline = :byline, visibility = :visibility, status = :status,
              starts_on = :starts, ends_on = :ends, days = :days, entries = :entries, photos = :photos,
              clips = :clips, places = :places, followers = :followers, open_url = :open, synced_at = now()
            where id = :id
            """)
                .param("id", id)
                .param("title", journey.title())
                .param("byline", byline)
                .param("visibility", journey.visibility().code())
                .param("status", journey.status().code())
                .param("starts", journey.startDate())
                .param("ends", journey.lastDay())
                .param("days", journey.days())
                .param("entries", journey.entries())
                .param("photos", journey.photos() == null ? 0 : journey.photos())
                .param("clips", clips)
                .param("places", journey.places() == null ? 0 : journey.places())
                .param("followers", journey.followers())
                .param("open", journey.openUrl())
                .update();
    }

    void setPage(UUID id, UUID pageId, int bookShots, boolean bookDayWords) {
        jdbc.sql(
                        "update kept_journeys set page_id = :page, book_shots = :shots, book_day_words = :words where id = :id")
                .param("id", id)
                .param("page", pageId)
                .param("shots", bookShots)
                .param("words", bookDayWords)
                .update();
    }

    void setCover(UUID id, UUID mediaId) {
        jdbc.sql("update kept_journeys set cover_media_id = :media where id = :id and cover_media_id is null")
                .param("id", id)
                .param("media", mediaId)
                .update();
    }

    void setAlbum(UUID id, UUID albumId) {
        jdbc.sql("update kept_journeys set album_id = :album where id = :id")
                .param("id", id)
                .param("album", albumId)
                .update();
    }

    /** Counts what came home, from what is written down: how many were here already, how many were brought. */
    void count(UUID id, int leftBehind) {
        jdbc.sql("""
            update kept_journeys k set
              matched = (select count(*) from kept_media m where m.kept_id = k.id and m.item_id is not null and m.matched),
              brought = (select count(*) from kept_media m where m.kept_id = k.id and m.item_id is not null and not m.matched),
              left_behind = :left
            where k.id = :id
            """).param("id", id).param("left", leftBehind).update();
    }

    /** The page is gone: what was written down about where things stand in it is forgotten, so a new page can be made. */
    void forgetBook(UUID id) {
        jdbc.sql("update kept_journeys set page_id = null, cover_media_id = null where id = :id")
                .param("id", id)
                .update();
        jdbc.sql("delete from kept_entries where kept_id = :id").param("id", id).update();
        jdbc.sql("delete from kept_days where kept_id = :id").param("id", id).update();
        jdbc.sql("update kept_media set page_media_id = null where kept_id = :id")
                .param("id", id)
                .update();
    }

    /** A trip's journey came home: the trip now knows its book. */
    void linkTrip(UUID folderId, UUID keptId) {
        jdbc.sql("update trips set kept_id = :kept where folder_id = :folder")
                .param("folder", folderId)
                .param("kept", keptId)
                .update();
    }

    /** Forgets that a journey was kept. The page, the album and the photos stay: they are things of their own. */
    void delete(UUID id) {
        jdbc.sql("delete from kept_journeys where id = :id").param("id", id).update();
    }

    // ---------- days, entries, photos ----------

    List<DayRow> days(UUID keptId) {
        return jdbc.sql("select * from kept_days where kept_id = :id order by day")
                .param("id", keptId)
                .query((rs, n) -> new DayRow(
                        rs.getObject("kept_id", UUID.class),
                        rs.getObject("day", LocalDate.class),
                        rs.getInt("number"),
                        rs.getString("place"),
                        rs.getObject("heading_block", UUID.class),
                        rs.getInt("shots")))
                .list();
    }

    void day(UUID keptId, LocalDate day, int number, String place, UUID headingBlock) {
        jdbc.sql("""
            insert into kept_days (kept_id, day, number, place, heading_block)
            values (:id, :day, :number, :place, :block)
            on conflict (kept_id, day) do update set heading_block = coalesce(kept_days.heading_block, excluded.heading_block),
              place = coalesce(kept_days.place, excluded.place)
            """)
                .param("id", keptId)
                .param("day", day)
                .param("number", number)
                .param("place", place)
                .param("block", headingBlock)
                .update();
    }

    /** Writes down how many photos and clips each day has in all, in the page or not. */
    void countShots(UUID keptId) {
        jdbc.sql("""
            update kept_days d set shots = (
              select count(*) from kept_media m join kept_entries e on e.kept_id = m.kept_id and e.entry_id = m.entry_id
              where m.kept_id = d.kept_id and e.day = d.day)
            where d.kept_id = :id
            """).param("id", keptId).update();
    }

    List<EntryRow> entries(UUID keptId) {
        return jdbc.sql("select * from kept_entries where kept_id = :id order by happened_at, entry_id")
                .param("id", keptId)
                .query((rs, n) -> new EntryRow(
                        rs.getObject("kept_id", UUID.class),
                        rs.getObject("entry_id", UUID.class),
                        rs.getObject("day", LocalDate.class),
                        Sql.instant(rs, "happened_at"),
                        rs.getString("title"),
                        rs.getString("place"),
                        (Double) rs.getObject("lat"),
                        (Double) rs.getObject("lng"),
                        rs.getObject("block", UUID.class)))
                .list();
    }

    /** Writes an entry down as kept. True when it was new: an entry is kept once. */
    boolean entry(EntryRow entry) {
        return jdbc.sql("""
            insert into kept_entries (kept_id, entry_id, day, happened_at, title, place, lat, lng, block)
            values (:kept, :entry, :day, :at, :title, :place, :lat, :lng, :block)
            on conflict (kept_id, entry_id) do nothing
            """)
                        .param("kept", entry.keptId())
                        .param("entry", entry.entryId())
                        .param("day", entry.day())
                        .param("at", Sql.timestamp(entry.happenedAt()))
                        .param("title", entry.title())
                        .param("place", entry.place())
                        .param("lat", entry.lat())
                        .param("lng", entry.lng())
                        .param("block", entry.block())
                        .update()
                == 1;
    }

    void lastBlock(UUID keptId, UUID entryId, UUID block) {
        jdbc.sql("update kept_entries set block = :block where kept_id = :kept and entry_id = :entry")
                .param("kept", keptId)
                .param("entry", entryId)
                .param("block", block)
                .update();
    }

    List<ShotRow> shots(UUID keptId) {
        return jdbc.sql("select * from kept_media where kept_id = :id")
                .param("id", keptId)
                .query((rs, n) -> new ShotRow(
                        rs.getObject("kept_id", UUID.class),
                        rs.getObject("media_id", UUID.class),
                        rs.getObject("entry_id", UUID.class),
                        MediaKind.read(rs.getString("kind")),
                        rs.getObject("item_id", UUID.class),
                        rs.getObject("page_media_id", UUID.class),
                        rs.getBoolean("matched")))
                .list();
    }

    /** Writes down what a photo or clip of the journey became here. What is known of it already is kept. */
    void shot(ShotRow shot) {
        jdbc.sql("""
            insert into kept_media (kept_id, media_id, entry_id, kind, item_id, page_media_id, matched)
            values (:kept, :media, :entry, :kind, :item, :page, :matched)
            on conflict (kept_id, media_id) do update set
              item_id = coalesce(kept_media.item_id, excluded.item_id),
              page_media_id = coalesce(kept_media.page_media_id, excluded.page_media_id),
              matched = kept_media.matched or excluded.matched
            """)
                .param("kept", shot.keptId())
                .param("media", shot.mediaId())
                .param("entry", shot.entryId())
                .param("kind", shot.kind().code())
                .param("item", shot.itemId())
                .param("page", shot.pageMediaId())
                .param("matched", shot.matched())
                .update();
    }

    /**
     * What kept journeys this person may see hold for this day of the year, from earlier years: one entry a
     * journey and year, the first of the day, with a picture when the day has one.
     */
    List<JourneyPastDay> onThisDay(UUID circleId, UUID me, LocalDate day, int limit) {
        return jdbc.sql("""
            select distinct on (k.id, e.day) k.id as kept_id, k.page_id, e.entry_id, e.day, d.number, e.title, e.place,
              (select m.page_media_id from kept_media m where m.kept_id = k.id and m.entry_id = e.entry_id
                 and m.page_media_id is not null limit 1) as page_media_id,
              (select m.item_id from kept_media m where m.kept_id = k.id and m.entry_id = e.entry_id
                 and m.item_id is not null limit 1) as item_id
            from kept_entries e join kept_journeys k on k.id = e.kept_id
              join kept_days d on d.kept_id = e.kept_id and d.day = e.day
            where k.circle_id = :circle and e.day < :today
              and extract(month from e.day) = :month and extract(day from e.day) = :dom
              and\s""" + SEEN + """
             order by k.id, e.day, e.happened_at, e.entry_id limit :limit
            """)
                .param("circle", circleId)
                .param("me", me)
                .param("today", day)
                .param("month", day.getMonthValue())
                .param("dom", day.getDayOfMonth())
                .param("limit", limit)
                .query((rs, n) -> new JourneyPastDay(
                        rs.getObject("kept_id", UUID.class),
                        rs.getObject("page_id", UUID.class),
                        rs.getObject("entry_id", UUID.class),
                        rs.getObject("day", LocalDate.class),
                        rs.getInt("number"),
                        rs.getString("title"),
                        rs.getString("place"),
                        rs.getObject("page_media_id", UUID.class),
                        rs.getObject("item_id", UUID.class)))
                .list();
    }

    /** The cover of each of these pages that is a kept journey's book, as its storage key: for a small picture. */
    Map<UUID, String> coversOfBooks(List<UUID> pageIds) {
        Map<UUID, String> covers = new HashMap<>();
        if (pageIds.isEmpty()) {
            return covers;
        }
        jdbc.sql("""
            select k.page_id, m.storage_key from kept_journeys k
            join media m on m.id = k.cover_media_id and m.status = 'ready' and m.has_sizes
            where k.page_id in (:pages)
            """)
                .param("pages", pageIds)
                .query((rs, n) -> covers.put(rs.getObject("page_id", UUID.class), rs.getString("storage_key")))
                .list();
        return covers;
    }

    /** How many journeys were kept in a circle in a week, with their titles: for the Sunday summary. */
    List<String> keptBetween(UUID circleId, UUID me, Instant from, Instant to) {
        return jdbc.sql("select k.title from kept_journeys k where k.circle_id = :circle"
                        + " and k.kept_at >= :from and k.kept_at < :to and " + SEEN + " order by k.kept_at limit 10")
                .param("circle", circleId)
                .param("me", me)
                .param("from", Sql.timestamp(from))
                .param("to", Sql.timestamp(to))
                .query(String.class)
                .list();
    }
}
