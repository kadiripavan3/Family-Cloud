package app.homeport.api.journey;

import app.homeport.api.common.Keyset;
import app.homeport.api.common.Rules;
import app.homeport.api.common.Sql;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes goodnights. Who may see one is decided by the thing it is. */
@Repository
class GoodnightStore {

    record Goodnight(
            ThingRow thing,
            UUID mediaId,
            UUID posterMediaId,
            Instant recordedAt,
            LocalDateTime recordedLocal,
            LocalDate forDay,
            String place,
            String dayLabel,
            UUID journeyId,
            UUID replyTo) {

        UUID id() {
            return thing.id();
        }
    }

    private static final String GOODNIGHT = "select " + ThingStore.COLUMNS + """
        , g.media_id, g.poster_media_id, g.recorded_at, g.recorded_local, g.for_day, g.place as recorded_in,
        g.day_label, g.journey_id, g.reply_to
        from goodnights g join things t on t.id = g.thing_id
        """;

    private static final String SEES = Rules.sees("t", ":me");

    private final JdbcClient jdbc;

    GoodnightStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static Goodnight goodnight(ResultSet rs, int n) throws SQLException {
        return new Goodnight(
                ThingStore.row(rs, n),
                rs.getObject("media_id", UUID.class),
                rs.getObject("poster_media_id", UUID.class),
                Sql.instant(rs, "recorded_at"),
                rs.getObject("recorded_local", LocalDateTime.class),
                rs.getObject("for_day", LocalDate.class),
                // "place" is the thing's own column (the Library); where it was recorded has a name of its own here.
                rs.getString("recorded_in"),
                rs.getString("day_label"),
                rs.getObject("journey_id", UUID.class),
                rs.getObject("reply_to", UUID.class));
    }

    void insert(
            UUID thingId,
            UUID circleId,
            UUID mediaId,
            UUID posterMediaId,
            Instant recordedAt,
            LocalDateTime recordedLocal,
            LocalDate forDay,
            String place,
            String dayLabel,
            UUID journeyId,
            UUID replyTo) {
        jdbc.sql("""
            insert into goodnights (thing_id, circle_id, media_id, poster_media_id, recorded_at, recorded_local,
              for_day, place, day_label, journey_id, reply_to)
            values (:id, :circle, :media, :poster, :at, cast(:local as timestamp), :day, :place, :label, :journey, :reply)
            on conflict (thing_id) do nothing
            """)
                .param("id", thingId)
                .param("circle", circleId)
                .param("media", mediaId)
                .param("poster", posterMediaId)
                .param("at", Sql.timestamp(recordedAt))
                .param("local", recordedLocal)
                .param("day", forDay)
                .param("place", place)
                .param("label", dayLabel)
                .param("journey", journeyId)
                .param("reply", replyTo)
                .update();
    }

    /** The goodnight a clip already belongs to, if it was sent before. */
    Optional<UUID> ofMedia(UUID mediaId) {
        return jdbc.sql("select thing_id from goodnights where media_id = :media")
                .param("media", mediaId)
                .query(UUID.class)
                .optional();
    }

    Optional<Goodnight> find(UUID id, UUID me) {
        return jdbc.sql(GOODNIGHT + " where g.thing_id = :id and " + SEES)
                .param("id", id)
                .param("me", me)
                .query(GoodnightStore::goodnight)
                .optional();
    }

    List<Goodnight> findAll(List<UUID> ids, UUID me) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(GOODNIGHT + " where g.thing_id in (:ids) and " + SEES)
                .param("ids", ids)
                .param("me", me)
                .query(GoodnightStore::goodnight)
                .list();
    }

    /** The goodnights of a circle that this person may see, the newest first. */
    List<Goodnight> list(UUID circleId, UUID me, Keyset page) {
        StringBuilder sql = new StringBuilder(GOODNIGHT + " where g.circle_id = :circle and " + SEES);
        Map<String, Object> params = new HashMap<>();
        if (!page.first()) {
            sql.append(" and (g.recorded_at, g.thing_id) < (cast(:at as timestamptz), cast(:after as uuid))");
            params.put("at", Sql.timestamp(page.instant(0)));
            params.put("after", page.uuid(1));
        }
        sql.append(" order by g.recorded_at desc, g.thing_id desc limit :limit");
        return jdbc.sql(sql.toString())
                .params(params)
                .param("circle", circleId)
                .param("me", me)
                .param("limit", page.fetch())
                .query(GoodnightStore::goodnight)
                .list();
    }

    /** The goodnights meant for one day at home that this person may see, the newest first. Ten at most. */
    List<Goodnight> forDay(UUID circleId, UUID me, LocalDate day) {
        return jdbc.sql(GOODNIGHT + " where g.circle_id = :circle and g.for_day = :day and " + SEES
                        + " order by g.recorded_at desc, g.thing_id desc limit 10")
                .param("circle", circleId)
                .param("me", me)
                .param("day", day)
                .query(GoodnightStore::goodnight)
                .list();
    }

    /** The answers sent back to these goodnights that this person may see, oldest first, by the one they answer. */
    Map<UUID, List<UUID>> replies(List<UUID> ids, UUID me) {
        Map<UUID, List<UUID>> replies = new HashMap<>();
        if (ids.isEmpty()) {
            return replies;
        }
        jdbc.sql("select g.reply_to, g.thing_id from goodnights g join things t on t.id = g.thing_id"
                        + " where g.reply_to in (:ids) and " + SEES + " order by g.recorded_at, g.thing_id")
                .param("ids", ids)
                .param("me", me)
                .query((rs, n) -> replies.computeIfAbsent(rs.getObject("reply_to", UUID.class), k -> new ArrayList<>())
                        .add(rs.getObject("thing_id", UUID.class)))
                .list();
        return replies;
    }

    void love(UUID thingId, UUID memberId) {
        jdbc.sql("insert into goodnight_loves (thing_id, member_id) values (:thing, :member) on conflict do nothing")
                .param("thing", thingId)
                .param("member", memberId)
                .update();
    }

    void unlove(UUID thingId, UUID memberId) {
        jdbc.sql("delete from goodnight_loves where thing_id = :thing and member_id = :member")
                .param("thing", thingId)
                .param("member", memberId)
                .update();
    }

    /** Who gave each of these a heart, the first first. */
    Map<UUID, List<UUID>> loves(List<UUID> thingIds) {
        Map<UUID, List<UUID>> loves = new HashMap<>();
        if (thingIds.isEmpty()) {
            return loves;
        }
        jdbc.sql(
                        "select thing_id, member_id from goodnight_loves where thing_id in (:ids) order by created_at, member_id")
                .param("ids", thingIds)
                .query((rs, n) -> loves.computeIfAbsent(rs.getObject("thing_id", UUID.class), k -> new ArrayList<>())
                        .add(rs.getObject("member_id", UUID.class)))
                .list();
        return loves;
    }

    /** How many goodnights arrived in a circle in a week that this person may see: for the Sunday summary. */
    int between(UUID circleId, UUID me, Instant from, Instant to) {
        return jdbc.sql("select count(*) from goodnights g join things t on t.id = g.thing_id"
                        + " where g.circle_id = :circle and g.recorded_at >= :from and g.recorded_at < :to and " + SEES)
                .param("circle", circleId)
                .param("me", me)
                .param("from", Sql.timestamp(from))
                .param("to", Sql.timestamp(to))
                .query(Integer.class)
                .single();
    }
}
