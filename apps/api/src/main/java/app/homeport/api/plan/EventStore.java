package app.homeport.api.plan;

import app.homeport.api.common.Rules;
import app.homeport.api.common.Sql;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes events and who is coming. Who may read one is decided by the thing it is. */
@Repository
public class EventStore {

    /** What an event has besides its title. No start time means all day. */
    public record EventRow(
            UUID id,
            LocalDate startsOn,
            LocalTime startTime,
            LocalDate endsOn,
            LocalTime endTime,
            String timeZone,
            String placeWords,
            String notes,
            String coverKey,
            Integer remindMinutes,
            Recurrence repeat,
            Instant alertAt) {

        public boolean allDay() {
            return startTime == null;
        }
    }

    /** An event together with the thing it is, as one viewer sees it. */
    public record Event(ThingRow thing, EventRow detail) {}

    /** Someone who is coming: a member of the circle (with their face and tint) or a name from outside. */
    public record GuestRow(
            UUID id,
            UUID eventId,
            UUID memberId,
            UUID userId,
            String name,
            String avatarKey,
            int tint,
            String part,
            Answer answer) {}

    static final String COLUMNS = """
        e.starts_on, e.start_time, e.ends_on, e.end_time, e.time_zone, e.place_words, e.notes,
        cm.storage_key as cover_key, e.remind_minutes, e.repeat_unit, e.repeat_every, e.repeat_days, e.repeat_until,
        e.alert_at\s""";

    static final String TABLES = """
        from things t join events e on e.thing_id = t.id
        left join media cm on cm.id = e.cover_media_id and cm.status = 'ready'\s""";

    private final JdbcClient jdbc;

    EventStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    static EventRow row(ResultSet rs) throws SQLException {
        return new EventRow(
                rs.getObject("id", UUID.class),
                rs.getObject("starts_on", LocalDate.class),
                PlanSql.time(rs, "start_time"),
                rs.getObject("ends_on", LocalDate.class),
                PlanSql.time(rs, "end_time"),
                rs.getString("time_zone"),
                rs.getString("place_words"),
                rs.getString("notes"),
                rs.getString("cover_key"),
                (Integer) rs.getObject("remind_minutes"),
                PlanSql.repeat(rs),
                Sql.instant(rs, "alert_at"));
    }

    public void insert(UUID id, EventRow e, UUID coverMediaId) {
        PlanSql.repeat(jdbc.sql("""
            insert into events (thing_id, starts_on, start_time, ends_on, end_time, time_zone, place_words, notes,
              cover_media_id, remind_minutes, repeat_unit, repeat_every, repeat_days, repeat_until, alert_at)
            values (:id, :starts_on, :start_time, :ends_on, :end_time, :zone, :place, :notes, :cover, :remind,
              :unit, :every, :days, :until, :alert)
            on conflict (thing_id) do nothing
            """), e.repeat())
                .param("id", id)
                .param("starts_on", e.startsOn())
                .param("start_time", e.startTime())
                .param("ends_on", e.endsOn())
                .param("end_time", e.endTime())
                .param("zone", e.timeZone())
                .param("place", e.placeWords())
                .param("notes", e.notes())
                .param("cover", coverMediaId)
                .param("remind", e.remindMinutes())
                .param("alert", Sql.timestamp(e.alertAt()))
                .update();
    }

    /** Writes everything about an event except its picture, which only changes when asked. */
    public void save(UUID id, EventRow e, boolean changeCover, UUID coverMediaId) {
        PlanSql.repeat(jdbc.sql("""
            update events set starts_on = :starts_on, start_time = :start_time, ends_on = :ends_on, end_time = :end_time,
              time_zone = :zone, place_words = :place, notes = :notes, remind_minutes = :remind,
              repeat_unit = :unit, repeat_every = :every, repeat_days = :days, repeat_until = :until, alert_at = :alert,
              cover_media_id = case when :change_cover then cast(:cover as uuid) else cover_media_id end
            where thing_id = :id
            """), e.repeat())
                .param("id", id)
                .param("starts_on", e.startsOn())
                .param("start_time", e.startTime())
                .param("ends_on", e.endsOn())
                .param("end_time", e.endTime())
                .param("zone", e.timeZone())
                .param("place", e.placeWords())
                .param("notes", e.notes())
                .param("remind", e.remindMinutes())
                .param("alert", Sql.timestamp(e.alertAt()))
                .param("change_cover", changeCover)
                .param("cover", coverMediaId == null ? null : coverMediaId.toString())
                .update();
    }

    /** The event's own details. Who may see it is checked first, through the thing. */
    public Optional<EventRow> find(UUID id) {
        return jdbc.sql("select t.id, " + COLUMNS + TABLES + " where t.id = :id")
                .param("id", id)
                .query((rs, n) -> row(rs))
                .optional();
    }

    /**
     * The events of a circle the viewer may see that can fall between two days: the ones that overlap them,
     * and every one that repeats and has started and not ended by then (which days it really falls on is
     * worked out afterwards). Five hundred at most.
     */
    public List<Event> between(UUID circleId, UUID me, LocalDate from, LocalDate to) {
        return jdbc.sql("select " + ThingStore.COLUMNS + ", " + COLUMNS + TABLES + """
             where t.circle_id = :circle and t.kind = 'event'
               and ((e.repeat_unit is null and e.starts_on <= :to and e.ends_on >= :from)
                 or (e.repeat_unit is not null and e.starts_on <= :to
                     and (e.repeat_until is null or e.repeat_until >= :from)))
               and\s""" + Rules.sees("t", ":me")
                        + " order by e.starts_on, e.start_time nulls first, t.id limit 500")
                .param("circle", circleId)
                .param("me", me)
                .param("from", from)
                .param("to", to)
                .query((rs, n) -> new Event(ThingStore.row(rs, n), row(rs)))
                .list();
    }

    /** These events, as far as the viewer may see them. */
    public List<Event> findAll(List<UUID> ids, UUID me) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("select " + ThingStore.COLUMNS + ", " + COLUMNS + TABLES + " where t.id in (:ids) and "
                        + Rules.sees("t", ":me"))
                .param("ids", ids)
                .param("me", me)
                .query((rs, n) -> new Event(ThingStore.row(rs, n), row(rs)))
                .list();
    }

    /**
     * The last event before a day that has a place and whose title starts with these words, among the ones
     * the viewer may see: where the haircut was last time.
     */
    public Optional<String> lastPlace(UUID circleId, UUID me, String titleStart, LocalDate before) {
        return jdbc.sql("""
            select e.place_words from things t join events e on e.thing_id = t.id
            where t.circle_id = :circle and t.kind = 'event' and e.place_words <> '' and e.starts_on < :before
              and t.title ilike :start and\s""" + Rules.sees("t", ":me") + " order by e.starts_on desc, t.id limit 1")
                .param("circle", circleId)
                .param("me", me)
                .param("before", before)
                .param("start", Sql.anywhere(titleStart).substring(1))
                .query(String.class)
                .optional();
    }

    // ---------- who is coming ----------

    private static final String GUESTS = """
        select g.id, g.thing_id, g.member_id, m.user_id, coalesce(m.name, g.name) as name, a.storage_key as avatar_key,
          coalesce(m.tint, 0) as tint, g.part, g.answer
        from event_guests g left join members m on m.id = g.member_id
        left join media a on a.id = m.avatar_media_id and a.status = 'ready'
        where (m.id is null or m.status <> 'left')\s""";

    private static GuestRow guest(ResultSet rs, int n) throws SQLException {
        return new GuestRow(
                rs.getObject("id", UUID.class),
                rs.getObject("thing_id", UUID.class),
                rs.getObject("member_id", UUID.class),
                rs.getObject("user_id", UUID.class),
                rs.getString("name"),
                rs.getString("avatar_key"),
                rs.getInt("tint"),
                rs.getString("part"),
                Answer.read(rs.getString("answer")));
    }

    /** Who is coming to these events, in the order they were put on each. */
    public List<GuestRow> guests(List<UUID> eventIds) {
        if (eventIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(GUESTS + " and g.thing_id in (:ids) order by g.thing_id, g.position, g.id")
                .param("ids", eventIds)
                .query(EventStore::guest)
                .list();
    }

    public Optional<GuestRow> guest(UUID guestId) {
        return jdbc.sql(GUESTS + " and g.id = :id")
                .param("id", guestId)
                .query(EventStore::guest)
                .optional();
    }

    public int countGuests(UUID eventId) {
        return jdbc.sql("select count(*) from event_guests where thing_id = :id")
                .param("id", eventId)
                .query(Integer.class)
                .single();
    }

    /**
     * Puts someone on an event, after whoever is on it already. A member is on an event once: adding them
     * again, or sending the same clientId again, adds nothing and returns the row that is there.
     */
    public UUID addGuest(UUID eventId, UUID memberId, String name, String part, Answer answer, UUID clientId) {
        if (memberId != null) {
            Optional<UUID> there = jdbc.sql(
                            "select id from event_guests where thing_id = :event and member_id = :member")
                    .param("event", eventId)
                    .param("member", memberId)
                    .query(UUID.class)
                    .optional();
            if (there.isPresent()) {
                return there.get();
            }
        }
        return jdbc.sql("""
            insert into event_guests (id, thing_id, member_id, name, part, answer, client_id, position)
            values (:id, :event, :member, :name, :part, :answer, :client,
              coalesce((select max(position) from event_guests where thing_id = :event), 0) + 1)
            on conflict (thing_id, client_id) do update set client_id = excluded.client_id
            returning id
            """)
                .param("id", UUID.randomUUID())
                .param("event", eventId)
                .param("member", memberId)
                .param("name", name)
                .param("part", part)
                .param("answer", answer == null ? null : answer.code())
                .param("client", clientId)
                .query(UUID.class)
                .single();
    }

    public void changeGuest(UUID guestId, String name, String part, Answer answer) {
        jdbc.sql("update event_guests set name = :name, part = :part, answer = :answer where id = :id")
                .param("id", guestId)
                .param("name", name)
                .param("part", part)
                .param("answer", answer == null ? null : answer.code())
                .update();
    }

    public void removeGuest(UUID guestId) {
        jdbc.sql("delete from event_guests where id = :id").param("id", guestId).update();
    }

    // ---------- pushes ----------

    /** An event whose push is due, with what the push says. */
    public record DueEvent(UUID id, UUID circleId, UUID ownerId, String title, EventRow detail) {}

    /**
     * Takes the events whose push is due by this moment, so that no other copy of the API takes them too.
     * The caller moves each one's moment on (or clears it) before the transaction ends.
     */
    public List<DueEvent> lockDue(Instant until, int limit) {
        return jdbc.sql("select t.id, t.circle_id, t.owner_id, t.title, " + COLUMNS + """
             from events e join things t on t.id = e.thing_id
             left join media cm on cm.id = e.cover_media_id and cm.status = 'ready'
             where e.alert_at <= :until order by e.alert_at limit :limit for update of e skip locked
            """)
                .param("until", Sql.timestamp(until))
                .param("limit", limit)
                .query((rs, n) -> new DueEvent(
                        rs.getObject("id", UUID.class),
                        rs.getObject("circle_id", UUID.class),
                        rs.getObject("owner_id", UUID.class),
                        rs.getString("title"),
                        row(rs)))
                .list();
    }

    /** Sets when an event's next push is due, or that none is. */
    public void alertAt(UUID id, Instant moment) {
        jdbc.sql("update events set alert_at = :at where thing_id = :id")
                .param("id", id)
                .param("at", Sql.timestamp(moment))
                .update();
    }

    /** Puts a push back that couldn't be handed over, unless the event has been given another moment since. */
    public void alertAgain(UUID id, Instant moment, Instant unless) {
        jdbc.sql("update events set alert_at = :at where thing_id = :id and alert_at is not distinct from :unless")
                .param("id", id)
                .param("at", Sql.timestamp(moment))
                .param("unless", Sql.timestamp(unless))
                .update();
    }
}
