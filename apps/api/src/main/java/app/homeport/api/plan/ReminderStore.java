package app.homeport.api.plan;

import app.homeport.api.common.Keyset;
import app.homeport.api.common.Rules;
import app.homeport.api.common.Sql;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads and writes reminders, who they are given to and when they were ticked. Who may read one is decided by the thing it is. */
@Repository
public class ReminderStore {

    /** What a reminder has besides its title. One that repeats has one due day at a time. */
    public record ReminderRow(
            UUID id,
            LocalDate dueOn,
            LocalTime dueTime,
            String timeZone,
            String notes,
            int remindMinutes,
            Recurrence repeat,
            boolean takesTurns,
            UUID turnMemberId,
            String placeWords,
            Double placeLat,
            Double placeLng,
            Integer placeRadiusM,
            int stars,
            Instant doneAt,
            UUID doneBy,
            Instant nudgedAt,
            Instant alertAt) {

        /** True for one that waits for a place instead of a time. */
        public boolean atPlace() {
            return !placeWords.isEmpty();
        }
    }

    /** A reminder together with the thing it is, as one viewer sees it. */
    public record Reminder(ThingRow thing, ReminderRow detail) {}

    /** One time a reminder was ticked. */
    public record TickRow(
            UUID id, UUID reminderId, LocalDate dueOn, Instant doneAt, UUID doneBy, UUID doneFor, int stars) {}

    /** A tick together with the reminder it was for. */
    public record Ticked(ThingRow thing, ReminderRow detail, TickRow tick) {}

    static final String COLUMNS = """
        r.due_on, r.due_time, r.time_zone, r.notes, r.remind_minutes, r.repeat_unit, r.repeat_every, r.repeat_days,
        r.repeat_until, r.takes_turns, r.turn_member_id, r.place_words, r.place_lat, r.place_lng, r.place_radius_m,
        r.stars, r.done_at, r.done_by, r.nudged_at, r.alert_at\s""";

    private static final String TICK_COLUMNS = """
        k.id as tick_id, k.due_on as tick_due_on, k.done_at as tick_done_at, k.done_by as tick_done_by,
        k.done_for as tick_done_for, k.stars as tick_stars\s""";

    private final JdbcClient jdbc;

    ReminderStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    static ReminderRow row(ResultSet rs) throws SQLException {
        return new ReminderRow(
                rs.getObject("id", UUID.class),
                rs.getObject("due_on", LocalDate.class),
                PlanSql.time(rs, "due_time"),
                rs.getString("time_zone"),
                rs.getString("notes"),
                rs.getInt("remind_minutes"),
                PlanSql.repeat(rs),
                rs.getBoolean("takes_turns"),
                rs.getObject("turn_member_id", UUID.class),
                rs.getString("place_words"),
                (Double) rs.getObject("place_lat"),
                (Double) rs.getObject("place_lng"),
                (Integer) rs.getObject("place_radius_m"),
                rs.getInt("stars"),
                Sql.instant(rs, "done_at"),
                rs.getObject("done_by", UUID.class),
                Sql.instant(rs, "nudged_at"),
                Sql.instant(rs, "alert_at"));
    }

    private static TickRow tick(ResultSet rs) throws SQLException {
        return new TickRow(
                rs.getObject("tick_id", UUID.class),
                rs.getObject("id", UUID.class),
                rs.getObject("tick_due_on", LocalDate.class),
                Sql.instant(rs, "tick_done_at"),
                rs.getObject("tick_done_by", UUID.class),
                rs.getObject("tick_done_for", UUID.class),
                rs.getInt("tick_stars"));
    }

    public void insert(UUID id, ReminderRow r) {
        bind(jdbc.sql("""
            insert into reminders (thing_id, due_on, due_time, time_zone, notes, remind_minutes, repeat_unit, repeat_every,
              repeat_days, repeat_until, takes_turns, turn_member_id, place_words, place_lat, place_lng, place_radius_m,
              stars, alert_at)
            values (:id, :due_on, :due_time, :zone, :notes, :remind, :unit, :every, :days, :until, :turns, :turn,
              :place, :lat, :lng, :radius, :stars, :alert)
            on conflict (thing_id) do nothing
            """), id, r).update();
    }

    /** Writes everything a person can change about a reminder. Whether it is done is written by ticking. */
    public void save(UUID id, ReminderRow r) {
        bind(jdbc.sql("""
            update reminders set due_on = :due_on, due_time = :due_time, time_zone = :zone, notes = :notes,
              remind_minutes = :remind, repeat_unit = :unit, repeat_every = :every, repeat_days = :days,
              repeat_until = :until, takes_turns = :turns, turn_member_id = :turn, place_words = :place,
              place_lat = :lat, place_lng = :lng, place_radius_m = :radius, stars = :stars, alert_at = :alert
            where thing_id = :id
            """), id, r).update();
    }

    private static JdbcClient.StatementSpec bind(JdbcClient.StatementSpec sql, UUID id, ReminderRow r) {
        return PlanSql.repeat(sql, r.repeat())
                .param("id", id)
                .param("due_on", r.dueOn())
                .param("due_time", r.dueTime())
                .param("zone", r.timeZone())
                .param("notes", r.notes())
                .param("remind", r.remindMinutes())
                .param("turns", r.takesTurns())
                .param("turn", r.turnMemberId())
                .param("place", r.placeWords())
                .param("lat", r.placeLat())
                .param("lng", r.placeLng())
                .param("radius", r.placeRadiusM())
                .param("stars", r.stars())
                .param("alert", Sql.timestamp(r.alertAt()));
    }

    /** The reminder's own details. Who may see it is checked first, through the thing. */
    public Optional<ReminderRow> find(UUID id) {
        return jdbc.sql("select r.thing_id as id, " + COLUMNS + " from reminders r where r.thing_id = :id")
                .param("id", id)
                .query((rs, n) -> row(rs))
                .optional();
    }

    /**
     * The reminders of a circle the viewer may see that are still to do, and the ones that were finished in
     * the last day and a half (so "done today" can be shown whatever the phone's time zone). Soonest due
     * first, the ones without a day last. Five hundred at most.
     */
    public List<Reminder> current(UUID circleId, UUID me) {
        return jdbc.sql("select " + ThingStore.COLUMNS + ", " + COLUMNS + """
             from things t join reminders r on r.thing_id = t.id
             where t.circle_id = :circle and t.kind = 'reminder'
               and (r.done_at is null or r.done_at > now() - interval '36 hours')
               and\s""" + Rules.sees("t", ":me")
                        + " order by r.due_on nulls last, r.due_time nulls last, t.created_at, t.id limit 500")
                .param("circle", circleId)
                .param("me", me)
                .query((rs, n) -> new Reminder(ThingStore.row(rs, n), row(rs)))
                .list();
    }

    /** These reminders, as far as the viewer may see them. */
    public List<Reminder> findAll(List<UUID> ids, UUID me) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("select " + ThingStore.COLUMNS + ", " + COLUMNS
                        + " from things t join reminders r on r.thing_id = t.id where t.id in (:ids) and "
                        + Rules.sees("t", ":me"))
                .param("ids", ids)
                .param("me", me)
                .query((rs, n) -> new Reminder(ThingStore.row(rs, n), row(rs)))
                .list();
    }

    // ---------- who it is given to ----------

    /** Who each of these reminders is given to, in the order they take turns. People who left aren't counted. */
    public Map<UUID, List<UUID>> people(List<UUID> reminderIds) {
        Map<UUID, List<UUID>> all = new LinkedHashMap<>();
        if (reminderIds.isEmpty()) {
            return all;
        }
        jdbc.sql("""
            select p.thing_id, p.member_id from reminder_people p join members m on m.id = p.member_id and m.status <> 'left'
            where p.thing_id in (:ids) order by p.thing_id, p.position, p.member_id
            """)
                .param("ids", reminderIds)
                .query((rs, n) -> all.computeIfAbsent(rs.getObject("thing_id", UUID.class), id -> new ArrayList<>())
                        .add(rs.getObject("member_id", UUID.class)))
                .list();
        return all;
    }

    public void givenTo(UUID id, List<UUID> memberIds) {
        jdbc.sql("delete from reminder_people where thing_id = :id")
                .param("id", id)
                .update();
        int position = 1;
        for (UUID member : memberIds) {
            jdbc.sql("insert into reminder_people (thing_id, member_id, position) values (:id, :member, :position)")
                    .param("id", id)
                    .param("member", member)
                    .param("position", position++)
                    .update();
        }
    }

    // ---------- ticking ----------

    /**
     * Writes down that a reminder was ticked for a due day. A due day is ticked once: the second time this
     * answers false and nothing changes.
     */
    public boolean tick(UUID reminderId, LocalDate dueOn, UUID doneBy, UUID doneFor, int stars) {
        return jdbc.sql("""
            insert into reminder_ticks (id, thing_id, due_on, done_by, done_for, stars)
            values (:id, :reminder, :due_on, :by, :done_for, :stars) on conflict do nothing
            """)
                        .param("id", UUID.randomUUID())
                        .param("reminder", reminderId)
                        .param("due_on", dueOn)
                        .param("by", doneBy)
                        .param("done_for", doneFor)
                        .param("stars", stars)
                        .update()
                > 0;
    }

    /** The last time a reminder was ticked. */
    public Optional<TickRow> lastTick(UUID reminderId) {
        return jdbc.sql("""
            select k.thing_id as id, k.id as tick_id, k.due_on as tick_due_on, k.done_at as tick_done_at,
              k.done_by as tick_done_by, k.done_for as tick_done_for, k.stars as tick_stars
            from reminder_ticks k where k.thing_id = :id order by k.done_at desc, k.id desc limit 1
            """).param("id", reminderId).query((rs, n) -> tick(rs)).optional();
    }

    /** The last tick of each of these reminders: the only one of its ticks that can be taken away. */
    public Set<UUID> lastTicks(List<UUID> reminderIds) {
        if (reminderIds.isEmpty()) {
            return Set.of();
        }
        return Set.copyOf(
                jdbc.sql("""
            select distinct on (k.thing_id) k.id from reminder_ticks k where k.thing_id in (:ids)
            order by k.thing_id, k.done_at desc, k.id desc
            """).param("ids", reminderIds).query(UUID.class).list());
    }

    public void removeTick(UUID tickId) {
        jdbc.sql("delete from reminder_ticks where id = :id")
                .param("id", tickId)
                .update();
    }

    /** Marks a reminder that doesn't repeat (or whose repeating is over) as done. */
    public void finish(UUID id, UUID doneBy) {
        jdbc.sql("update reminders set done_at = now(), done_by = :by, alert_at = null where thing_id = :id")
                .param("id", id)
                .param("by", doneBy)
                .update();
    }

    /** Moves a reminder to a due day: the next time round after a tick, or back again when the tick is taken away. */
    public void dueOn(UUID id, LocalDate dueOn, UUID turnMemberId, Instant alertAt) {
        jdbc.sql("""
            update reminders set due_on = :due_on, turn_member_id = :turn, alert_at = :alert, done_at = null, done_by = null
            where thing_id = :id
            """)
                .param("id", id)
                .param("due_on", dueOn)
                .param("turn", turnMemberId)
                .param("alert", Sql.timestamp(alertAt))
                .update();
    }

    /**
     * The ticks of a circle's reminders the viewer may see, for due days from one day to another, or made on
     * those days where the reminder is. Used for "done today" and for the days gone by on the calendar.
     */
    public List<Ticked> ticked(UUID circleId, UUID me, LocalDate from, LocalDate to) {
        return jdbc.sql("select " + ThingStore.COLUMNS + ", " + COLUMNS + ", " + TICK_COLUMNS + """
             from things t join reminders r on r.thing_id = t.id join reminder_ticks k on k.thing_id = t.id
             where t.circle_id = :circle and t.kind = 'reminder'
               and ((k.due_on between :from and :to)
                 or (k.done_at >= cast(:from as date) - 1 and k.done_at < cast(:to as date) + 2
                     and (k.done_at at time zone r.time_zone)::date between :from and :to))
               and\s"""
                        + Rules.sees("t", ":me") + " order by k.done_at, k.id limit 500")
                .param("circle", circleId)
                .param("me", me)
                .param("from", from)
                .param("to", to)
                .query((rs, n) -> new Ticked(ThingStore.row(rs, n), row(rs), tick(rs)))
                .list();
    }

    /** What was ticked in a circle among the reminders the viewer may see, last ticked first, a page at a time. */
    public List<Ticked> done(UUID circleId, UUID me, Keyset page) {
        return jdbc.sql("select " + ThingStore.COLUMNS + ", " + COLUMNS + ", " + TICK_COLUMNS + """
             from things t join reminders r on r.thing_id = t.id join reminder_ticks k on k.thing_id = t.id
             where t.circle_id = :circle and t.kind = 'reminder'
               and (cast(:at as timestamptz) is null or (k.done_at, k.id) < (cast(:at as timestamptz), cast(:id as uuid)))
               and\s"""
                        + Rules.sees("t", ":me") + " order by k.done_at desc, k.id desc limit :limit")
                .param("circle", circleId)
                .param("me", me)
                .param("at", page.first() ? null : Sql.timestamp(page.instant(0)))
                .param("id", page.first() ? null : page.uuid(1).toString())
                .param("limit", page.fetch())
                .query((rs, n) -> new Ticked(ThingStore.row(rs, n), row(rs), tick(rs)))
                .list();
    }

    // ---------- what is attached ----------

    /** The titles of what each of these things is linked to, as far as the viewer may see it. */
    public Map<UUID, List<String>> attached(List<UUID> ids, UUID me) {
        Map<UUID, List<String>> all = new LinkedHashMap<>();
        if (ids.isEmpty()) {
            return all;
        }
        jdbc.sql("""
            select l.this, t.title from (
              select from_id as this, to_id as other, created_at from thing_links where from_id in (:ids)
              union all select to_id, from_id, created_at from thing_links where to_id in (:ids)) l
            join things t on t.id = l.other where\s""" + Rules.sees("t", ":me") + " order by l.created_at, t.id")
                .param("ids", ids)
                .param("me", me)
                .query((rs, n) -> all.computeIfAbsent(rs.getObject("this", UUID.class), id -> new ArrayList<>())
                        .add(rs.getString("title")))
                .list();
        return all;
    }

    // ---------- nudging and pushes ----------

    /** Notes a nudge, when the last one was more than an hour ago. Answers whether this one counts. */
    public boolean nudge(UUID id) {
        return jdbc.sql("""
            update reminders set nudged_at = now() where thing_id = :id
              and (nudged_at is null or nudged_at < now() - interval '1 hour')
            """).param("id", id).update() > 0;
    }

    public void forgetNudge(UUID id) {
        jdbc.sql("update reminders set nudged_at = null where thing_id = :id")
                .param("id", id)
                .update();
    }

    /** A reminder whose push is due, with what the push says. */
    public record DueReminder(UUID id, UUID circleId, UUID ownerId, String title, ReminderRow detail) {}

    /**
     * Takes the reminders whose push is due by this moment, so that no other copy of the API takes them too,
     * and clears the moment: a reminder is pushed once for each time it is due.
     */
    public List<DueReminder> takeDue(Instant until, int limit) {
        List<DueReminder> due = jdbc.sql("select t.id, t.circle_id, t.owner_id, t.title, " + COLUMNS + """
             from reminders r join things t on t.id = r.thing_id
             where r.alert_at <= :until order by r.alert_at limit :limit for update of r skip locked
            """)
                .param("until", Sql.timestamp(until))
                .param("limit", limit)
                .query((rs, n) -> new DueReminder(
                        rs.getObject("id", UUID.class),
                        rs.getObject("circle_id", UUID.class),
                        rs.getObject("owner_id", UUID.class),
                        rs.getString("title"),
                        row(rs)))
                .list();
        if (!due.isEmpty()) {
            jdbc.sql("update reminders set alert_at = null where thing_id in (:ids)")
                    .param("ids", due.stream().map(DueReminder::id).toList())
                    .update();
        }
        return due;
    }

    /** Puts a push back that couldn't be handed over, unless the reminder has been given another moment since. */
    public void alertAgain(UUID id, Instant moment) {
        jdbc.sql("update reminders set alert_at = :at where thing_id = :id and alert_at is null and done_at is null")
                .param("id", id)
                .param("at", Sql.timestamp(moment))
                .update();
    }
}
