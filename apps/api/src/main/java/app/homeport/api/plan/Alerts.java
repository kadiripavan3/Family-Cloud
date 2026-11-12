package app.homeport.api.plan;

import app.homeport.api.plan.EventStore.EventRow;
import app.homeport.api.plan.ReminderStore.ReminderRow;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Optional;

/**
 * When the push for an event or a reminder is due. An event that asked for a reminder is pushed that long
 * before it starts, each time it comes round. A reminder is pushed when it is due (that long before, if it
 * asked). Something with a day and no time counts as nine in the morning there. A moment that has already
 * passed is never handed out: nobody is told about what they have just written down.
 */
final class Alerts {

    private Alerts() {}

    /** The first moment after {@code after} at which this event wants a push, or null when it wants none. */
    static Instant forEvent(EventRow e, Instant after) {
        if (e.remindMinutes() == null) {
            return null;
        }
        ZoneId zone = PlanSql.storedZone(e.timeZone());
        LocalTime time = e.startTime() == null ? PlanSql.MORNING : e.startTime();
        if (e.repeat() == null) {
            return later(e.startsOn(), time, zone, e.remindMinutes(), after);
        }
        // The time it comes round whose push is still ahead: a few steps at most, each a day or more apart.
        LocalDate from = after.atZone(zone).toLocalDate().minusDays(1);
        Optional<LocalDate> day = e.repeat().nextOnOrAfter(e.startsOn(), from);
        for (int tries = 0; day.isPresent() && tries < 50; tries++) {
            Instant moment = later(day.get(), time, zone, e.remindMinutes(), after);
            if (moment != null) {
                return moment;
            }
            day = e.repeat().nextAfter(e.startsOn(), day.get());
        }
        return null;
    }

    /** The moment this reminder wants its push, when that is after {@code after}; null when it wants none. */
    static Instant forReminder(ReminderRow r, Instant after) {
        if (r.dueOn() == null || r.doneAt() != null) {
            return null;
        }
        return later(
                r.dueOn(),
                r.dueTime() == null ? PlanSql.MORNING : r.dueTime(),
                PlanSql.storedZone(r.timeZone()),
                r.remindMinutes(),
                after);
    }

    private static Instant later(LocalDate day, LocalTime time, ZoneId zone, int minutesBefore, Instant after) {
        Instant moment = day.atTime(time).atZone(zone).toInstant().minusSeconds(minutesBefore * 60L);
        return moment.isAfter(after) ? moment : null;
    }
}
