package app.homeport.api.plan;

import app.homeport.api.board.templates.CalendarDinners;
import app.homeport.api.library.DatedThings;
import app.homeport.api.plan.EventStore.Event;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * What Plan tells other places about its events, each through the small question that place asks: the
 * Library asks on which days a thing happens (so a passport linked to a trip can say it runs out too soon
 * after it), and the weekly meal plan asks which dinners are in the calendar.
 */
@Component
class PlanDays implements DatedThings, CalendarDinners {

    /** An event is a dinner when its title says so. Read by rule: the word has to be there. */
    private static final Pattern DINNER = Pattern.compile("\\b(dinner|supper)\\b", Pattern.CASE_INSENSITIVE);

    private final EventStore events;
    private final JdbcClient jdbc;

    PlanDays(EventStore events, JdbcClient jdbc) {
        this.events = events;
        this.jdbc = jdbc;
    }

    /** The first and last day of each of these things that is an event. Who may see each was checked by whoever asks. */
    @Override
    public Map<UUID, Days> daysOf(List<UUID> thingIds) {
        Map<UUID, Days> days = new HashMap<>();
        if (thingIds.isEmpty()) {
            return days;
        }
        jdbc.sql("select thing_id, starts_on, ends_on from events where thing_id in (:ids)")
                .param("ids", thingIds)
                .query((rs, n) -> days.put(
                        rs.getObject("thing_id", UUID.class),
                        new Days(rs.getObject("starts_on", LocalDate.class), rs.getObject("ends_on", LocalDate.class))))
                .list();
        return days;
    }

    /** The dinners in the calendar between two days that this person may see, each on every day it falls on. */
    @Override
    public List<Dinner> between(UUID circleId, UUID viewer, LocalDate from, LocalDate to) {
        List<Dinner> dinners = new ArrayList<>();
        for (Event event : events.between(circleId, viewer, from, to)) {
            if (!DINNER.matcher(event.thing().title()).find()) {
                continue;
            }
            LocalDate start = event.detail().startsOn();
            List<LocalDate> on = new ArrayList<>();
            if (!start.isBefore(from) && !start.isAfter(to)) {
                on.add(start);
            }
            if (event.detail().repeat() != null) {
                event.detail().repeat().between(start, from, to).stream()
                        .filter(day -> !on.contains(day))
                        .forEach(on::add);
            }
            on.forEach(day -> dinners.add(
                    new Dinner(event.thing().id(), day, event.thing().title())));
        }
        return dinners;
    }
}
