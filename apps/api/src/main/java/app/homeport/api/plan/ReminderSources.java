package app.homeport.api.plan;

import app.homeport.api.guest.GuestView;
import app.homeport.api.plan.PlanPeople.Person;
import app.homeport.api.plan.ReminderStore.Reminder;
import app.homeport.api.plan.ReminderStore.ReminderRow;
import app.homeport.api.thing.GlanceSource;
import app.homeport.api.thing.ThingKind;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** What reminders bring to the rest: "2 Jan · Alex" next to one in a list of mixed kinds, and how a guest reads one. */
@Component
class ReminderSources implements GlanceSource, GuestView {

    private final ReminderStore reminders;
    private final PlanPeople people;

    ReminderSources(ReminderStore reminders, PlanPeople people) {
        this.reminders = reminders;
        this.people = people;
    }

    @Override
    public ThingKind kind() {
        return ThingKind.REMINDER;
    }

    @Override
    public Map<UUID, String> glances(List<UUID> thingIds, UUID me) {
        List<Reminder> found = reminders.findAll(thingIds, me);
        Map<UUID, List<UUID>> givenTo =
                reminders.people(found.stream().map(r -> r.thing().id()).toList());
        Map<UUID, Map<UUID, Person>> circles = new HashMap<>();
        Map<UUID, String> glances = new HashMap<>();
        for (Reminder reminder : found) {
            Map<UUID, Person> circle = circles.computeIfAbsent(reminder.thing().circleId(), people::in);
            List<UUID> given = givenTo.getOrDefault(reminder.thing().id(), List.of());
            String who = Words.list(ReminderService.holders(reminder.thing(), reminder.detail(), given).stream()
                    .filter(holder -> !given.isEmpty())
                    .map(circle::get)
                    .filter(Objects::nonNull)
                    .map(Person::name)
                    .toList());
            glances.put(reminder.thing().id(), Words.dots(when(reminder.detail()), who));
        }
        return glances;
    }

    /**
     * "Done", "Today 19:00", "Friday", "2 Jan", "Near the post office", or "Some time". A day that isn't in
     * this year says its year, "2 Jan 2027": a glance stands alone, with nothing near it to say which January.
     */
    static String when(ReminderRow r) {
        if (r.doneAt() != null) {
            return "Done";
        }
        if (r.dueOn() == null) {
            return r.atPlace() ? "Near " + r.placeWords() : "Some time";
        }
        LocalDate today = LocalDate.now(PlanSql.storedZone(r.timeZone()));
        return when(r, today);
    }

    static String when(ReminderRow r, LocalDate today) {
        boolean near = Math.abs(ChronoUnit.DAYS.between(today, r.dueOn())) <= 6;
        return Words.capital(near ? Words.weekdayNear(r.dueOn(), today) : Words.dateInYear(r.dueOn(), today))
                + (r.dueTime() == null ? "" : " " + Words.time(r.dueTime()));
    }

    @Override
    public Card show(UUID thingId) {
        return reminders
                .find(thingId)
                .map(r -> new Card(
                        "Reminder",
                        String.join(
                                        "\n",
                                        Words.dots(
                                                when(r),
                                                r.repeat() == null
                                                        ? null
                                                        : r.repeat().label()),
                                        r.notes())
                                .strip()))
                .orElse(new Card("Reminder", null));
    }
}
