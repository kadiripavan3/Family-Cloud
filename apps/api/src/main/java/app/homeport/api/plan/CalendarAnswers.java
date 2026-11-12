package app.homeport.api.plan;

import app.homeport.api.board.templates.CalendarDinners;
import app.homeport.api.board.templates.FreeDay;
import app.homeport.api.library.DatedThings;
import app.homeport.api.plan.EventStore.Event;
import app.homeport.api.plan.EventStore.EventRow;
import app.homeport.api.plan.EventStore.GuestRow;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * What the calendar tells the places that ask it something, each through the small interface that place
 * wrote down for it:
 *
 * <ul>
 *   <li>the Library asks when a trip is, so that a passport linked to it can say it runs out too soon after
 *       ({@link DatedThings});
 *   <li>the weekly meal plan asks for the dinners in the calendar, to show them on their day with "From the
 *       calendar" ({@link CalendarDinners}). A dinner is an event with the word dinner or supper in its name:
 *       it is read by that rule, not guessed at;
 *   <li>the Saturday jar asks who has something on, for "All four free" ({@link FreeDay}). Events count, on
 *       every day they cover: a job to tick or a bill to pay keeps nobody from an afternoon out.
 * </ul>
 *
 * The events are read as the calendar reads them ({@link EventStore#between}), so one that repeats is there
 * each time it comes round, and only what the person asking may see answers.
 */
@Component
class CalendarAnswers implements DatedThings, CalendarDinners, FreeDay {

    private static final Pattern DINNER = Pattern.compile("(?iu).*\\b(dinner|supper)\\b.*");

    private final EventStore events;

    CalendarAnswers(EventStore events) {
        this.events = events;
    }

    /** True for an event whose name says it is a dinner. */
    static boolean isDinner(String title) {
        return title != null && DINNER.matcher(title).matches();
    }

    @Override
    public Map<UUID, Days> daysOf(List<UUID> thingIds) {
        return events.days(thingIds).entrySet().stream()
                .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        e -> new Days(e.getValue().getKey(), e.getValue().getValue())));
    }

    @Override
    public List<Dinner> between(UUID circleId, UUID viewer, LocalDate from, LocalDate to) {
        List<Dinner> dinners = new ArrayList<>();
        for (Event event : events.between(circleId, viewer, from, to)) {
            if (isDinner(event.thing().title())) {
                for (LocalDate start : starts(event.detail(), from, to)) {
                    if (!start.isBefore(from) && !start.isAfter(to)) {
                        dinners.add(new Dinner(
                                event.thing().id(), start, event.thing().title()));
                    }
                }
            }
        }
        return dinners;
    }

    @Override
    public List<UUID> busy(UUID circleId, UUID viewer, LocalDate day) {
        List<Event> on = events.between(circleId, viewer, day, day).stream()
                .filter(event -> !starts(event.detail(), day, day).isEmpty())
                .toList();
        Map<UUID, List<GuestRow>> guests = events
                .guests(on.stream().map(event -> event.thing().id()).toList())
                .stream()
                .collect(Collectors.groupingBy(GuestRow::eventId));
        Set<UUID> busy = new LinkedHashSet<>();
        for (Event event : on) {
            // Whoever is on it; an event with nobody on it is its maker's own.
            List<UUID> members = guests.getOrDefault(event.thing().id(), List.of()).stream()
                    .map(GuestRow::memberId)
                    .filter(Objects::nonNull)
                    .toList();
            busy.addAll(members.isEmpty() ? List.of(event.thing().ownerId()) : members);
        }
        return List.copyOf(busy);
    }

    /**
     * The days an event starts on such that it covers some day from {@code from} to {@code to}: its one start
     * for an event that happens once, each time round for one that repeats.
     */
    private static List<LocalDate> starts(EventRow e, LocalDate from, LocalDate to) {
        long span = ChronoUnit.DAYS.between(e.startsOn(), e.endsOn());
        List<LocalDate> starts =
                e.repeat() == null ? List.of(e.startsOn()) : e.repeat().between(e.startsOn(), from.minusDays(span), to);
        return starts.stream()
                .filter(start -> !start.isAfter(to) && !start.plusDays(span).isBefore(from))
                .toList();
    }
}
