package app.homeport.api.library;

import app.homeport.api.common.Rules;
import app.homeport.api.digest.DigestSource;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.thing.ThingKind;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * The Library's part of the Sunday summary: how many photos and videos arrived this week that this person
 * may see, and the most loved of them at the top ("86 new photos, one very good Saturday").
 */
@Component
class LibraryDigest implements DigestSource {

    private static final DateTimeFormatter WEEKDAY = DateTimeFormatter.ofPattern("EEEE", Locale.ENGLISH);

    private static final String THIS_WEEK = """
        from library_items i join things t on t.id = i.thing_id
        where i.circle_id = :circle and i.kind in ('photo', 'video') and i.created_at >= :from and i.created_at < :until
          and\s""" + Rules.sees("t", ":me");

    private final JdbcClient jdbc;
    private final MediaService media;

    LibraryDigest(JdbcClient jdbc, MediaService media) {
        this.jdbc = jdbc;
        this.media = media;
    }

    private record Loved(
            UUID id, ThingKind kind, String title, String pictureKey, LocalDateTime takenLocal, int loves) {}

    @Override
    public Part week(UUID me, UUID circleId, LocalDate from, LocalDate to) {
        Timestamp start = Timestamp.from(from.atStartOfDay().toInstant(ZoneOffset.UTC));
        Timestamp until = Timestamp.from(to.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC));
        int count = jdbc.sql("select count(*) " + THIS_WEEK)
                .param("circle", circleId)
                .param("me", me)
                .param("from", start)
                .param("until", until)
                .query(Integer.class)
                .single();
        if (count == 0) {
            return Part.nothing();
        }
        // The one with the most hearts; among equals, the newest. A week nobody loved anything in still has a newest.
        Loved loved = jdbc.sql("""
            select i.thing_id, i.kind, t.title, i.taken_local,
              (select f.storage_key from media f where f.id = coalesce(i.poster_media_id, i.media_id)
                 and f.has_sizes and f.status = 'ready') as picture_key,
              (select count(*) from library_loves l where l.thing_id = i.thing_id) as loves
            """ + THIS_WEEK + " order by loves desc, i.taken_local desc, i.thing_id limit 1")
                .param("circle", circleId)
                .param("me", me)
                .param("from", start)
                .param("until", until)
                .query((rs, n) -> new Loved(
                        rs.getObject("thing_id", UUID.class),
                        ThingKind.read(rs.getString("kind")),
                        rs.getString("title"),
                        rs.getString("picture_key"),
                        rs.getObject("taken_local", LocalDateTime.class),
                        rs.getInt("loves")))
                .single();
        String photos = count == 1 ? "1 new photo" : count + " new photos";
        return Part.of(
                List.of(new Stat(String.valueOf(count), count == 1 ? "photo" : "photos", 10)),
                new Hero(
                        loved.id(),
                        loved.kind(),
                        media.urlFor(loved.pictureKey(), MediaSize.MEDIUM),
                        loved.loves() > 0 ? "Most loved" : "This week",
                        loved.loves() > 0 ? photos + ", one very good " + WEEKDAY.format(loved.takenLocal()) : photos,
                        loved.title().isBlank() ? null : loved.title()),
                List.of());
    }
}
