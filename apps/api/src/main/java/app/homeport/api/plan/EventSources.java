package app.homeport.api.plan;

import app.homeport.api.guest.GuestView;
import app.homeport.api.plan.EventStore.Event;
import app.homeport.api.plan.EventStore.EventRow;
import app.homeport.api.thing.GlanceSource;
import app.homeport.api.thing.ThingKind;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/** What events bring to the rest: "Sat 5 Dec, 14:00" next to one in a list of mixed kinds, and how a guest reads one. */
@Component
class EventSources implements GlanceSource, GuestView {

    private final EventStore events;

    EventSources(EventStore events) {
        this.events = events;
    }

    @Override
    public ThingKind kind() {
        return ThingKind.EVENT;
    }

    @Override
    public Map<UUID, String> glances(List<UUID> thingIds, UUID me) {
        return events.findAll(thingIds, me).stream()
                .collect(Collectors.toMap(e -> e.thing().id(), EventSources::glance));
    }

    private static String glance(Event event) {
        return when(
                event.detail(), LocalDate.now(PlanSql.storedZone(event.detail().timeZone())));
    }

    /** When it is next: the day it happens (the next time round for one that repeats), its time, and how it repeats. */
    static String when(EventRow e, LocalDate today) {
        LocalDate day = e.repeat() == null
                ? e.startsOn()
                : e.repeat().nextOnOrAfter(e.startsOn(), today).orElse(e.startsOn());
        return Words.dots(
                Words.stamp(day, e.startTime(), today),
                e.repeat() == null ? null : e.repeat().label());
    }

    @Override
    public Card show(UUID thingId) {
        return events.find(thingId)
                .map(e -> {
                    LocalDate today = LocalDate.now(PlanSql.storedZone(e.timeZone()));
                    String until = e.endTime() == null ? "" : " to " + Words.time(e.endTime());
                    return new Card(
                            "Event",
                            String.join("\n", when(e, today) + until, e.placeWords(), e.notes())
                                    .replaceAll("\n{2,}", "\n")
                                    .strip());
                })
                .orElse(new Card("Event", null));
    }
}
