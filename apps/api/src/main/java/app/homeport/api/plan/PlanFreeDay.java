package app.homeport.api.plan;

import app.homeport.api.board.templates.FreeDay;
import app.homeport.api.plan.EventStore.Event;
import app.homeport.api.plan.EventStore.EventRow;
import app.homeport.api.plan.EventStore.GuestRow;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * What the calendar tells the Saturday jar when it asks who has something on, for "All four free"
 * ({@link FreeDay}). Events count, on every day they cover and each time they come round: a job to tick or a
 * bill to pay keeps nobody from an afternoon out. Whoever is on an event is busy; an event with nobody on it
 * is its maker's own.
 *
 * <p>The events are read as the calendar reads them ({@link EventStore#between}), so only what the person
 * asking may see answers: something one person keeps to themselves makes nobody look busy to the others.
 */
@Component
class PlanFreeDay implements FreeDay {

    private final EventStore events;

    PlanFreeDay(EventStore events) {
        this.events = events;
    }

    @Override
    public List<UUID> busy(UUID circleId, UUID viewer, LocalDate day) {
        List<Event> on = events.between(circleId, viewer, day, day).stream()
                .filter(event -> fallsOn(event.detail(), day))
                .toList();
        Map<UUID, List<GuestRow>> guests = events
                .guests(on.stream().map(event -> event.thing().id()).toList())
                .stream()
                .collect(Collectors.groupingBy(GuestRow::eventId));
        Set<UUID> busy = new LinkedHashSet<>();
        for (Event event : on) {
            List<UUID> members = guests.getOrDefault(event.thing().id(), List.of()).stream()
                    .map(GuestRow::memberId)
                    .filter(Objects::nonNull)
                    .toList();
            busy.addAll(members.isEmpty() ? List.of(event.thing().ownerId()) : members);
        }
        return List.copyOf(busy);
    }

    /** True when the event covers this day: its one time, or one of the times it comes round. */
    static boolean fallsOn(EventRow e, LocalDate day) {
        long span = ChronoUnit.DAYS.between(e.startsOn(), e.endsOn());
        List<LocalDate> starts =
                e.repeat() == null ? List.of(e.startsOn()) : e.repeat().between(e.startsOn(), day.minusDays(span), day);
        return starts.stream()
                .anyMatch(start -> !start.isAfter(day) && !start.plusDays(span).isBefore(day));
    }
}
