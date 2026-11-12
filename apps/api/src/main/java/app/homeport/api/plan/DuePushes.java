package app.homeport.api.plan;

import app.homeport.api.common.Jobs;
import app.homeport.api.notify.Outbox;
import app.homeport.api.notify.Push;
import app.homeport.api.notify.PushDelivery;
import app.homeport.api.notify.PushKind;
import app.homeport.api.plan.EventStore.DueEvent;
import app.homeport.api.plan.EventStore.GuestRow;
import app.homeport.api.plan.PlanPeople.Person;
import app.homeport.api.plan.ReminderStore.DueReminder;
import app.homeport.api.plan.ReminderStore.ReminderRow;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Tells people about what is due: an event that asked for a reminder, a little before it starts; a reminder,
 * when it is due. Every minute, in one short transaction: lock the events and reminders whose moment has
 * come, move each one's moment on (to the next time round, or to nothing), and put a push in the
 * {@link Outbox} for everyone who hears of it: the people who are coming or who have the job, as far as they
 * may see it at this moment. Marking it here, in the same transaction as the pushes, is what makes each go
 * out once.
 *
 * <p>Sending is the outbox's work ({@link PushDelivery}): it checks each person's settings and what they
 * may see once more, tries again when the push service can't be reached, and hands nothing over twice. It is
 * asked to send straight away, so a reminder isn't half a minute late.
 */
@Component
public class DuePushes {

    private static final Logger log = LoggerFactory.getLogger(DuePushes.class);

    /** How many events and how many reminders one run takes. */
    static final int AT_ONCE = 100;
    /** A push goes out up to this long before its moment, so it isn't a minute late. */
    static final Duration AHEAD = Duration.ofSeconds(30);
    /** After the API was away for longer than this, what was due in between is not announced any more. */
    static final Duration TOO_LATE = Duration.ofHours(3);

    private final EventStore events;
    private final ReminderStore reminders;
    private final PlanPushes pushes;
    private final PlanPeople people;
    private final Outbox outbox;
    private final PushDelivery delivery;
    private final TransactionTemplate transaction;
    private final Jobs jobs;

    DuePushes(
            EventStore events,
            ReminderStore reminders,
            PlanPushes pushes,
            PlanPeople people,
            Outbox outbox,
            PushDelivery delivery,
            TransactionTemplate transaction,
            Jobs jobs) {
        this.events = events;
        this.reminders = reminders;
        this.pushes = pushes;
        this.people = people;
        this.outbox = outbox;
        this.delivery = delivery;
        this.transaction = transaction;
        this.jobs = jobs;
    }

    @Scheduled(initialDelayString = "PT1M", fixedDelayString = "${homeport.plan.push-every:PT1M}")
    void everyMinute() {
        Instant now = Instant.now();
        jobs.run("plan_pushes", now.truncatedTo(ChronoUnit.MINUTES).toString(), () -> {
            // Keep going while there is a full batch waiting, but never hog the scheduler.
            for (int round = 0; round < 10 && sendDue(Instant.now()) >= AT_ONCE; round++) {
                log.debug("More pushes about what is due are waiting.");
            }
        });
    }

    /**
     * Queues the pushes for everything that is due at this moment and asks for them to be sent. Returns how
     * many events and reminders it took. Safe to run in several copies of the API at once: each takes its
     * own rows.
     */
    public int sendDue(Instant now) {
        Integer taken = transaction.execute(status -> take(now));
        if (taken == null || taken == 0) {
            return 0;
        }
        delivery.deliverDue();
        return taken;
    }

    /** Everything whose moment has come: marked, with a push in the outbox for each person who hears of it. */
    private int take(Instant now) {
        Instant until = now.plus(AHEAD);
        Instant notBefore = now.minus(TOO_LATE);

        List<DueEvent> dueEvents = events.lockDue(until, AT_ONCE);
        Map<UUID, List<GuestRow>> guests = events
                .guests(dueEvents.stream().map(DueEvent::id).toList())
                .stream()
                .collect(Collectors.groupingBy(GuestRow::eventId));
        for (DueEvent due : dueEvents) {
            Instant moment = due.detail().alertAt();
            events.alertAt(due.id(), Alerts.forEvent(due.detail(), moment));
            if (moment.isBefore(notBefore)) {
                continue;
            }
            // Whoever made it and whoever is coming; someone who said they can't isn't told it is about to start.
            Set<UUID> hear = new LinkedHashSet<>();
            hear.add(due.ownerId());
            guests.getOrDefault(due.id(), List.of()).stream()
                    .filter(g -> g.memberId() != null && g.answer() != Answer.CANT)
                    .forEach(g -> hear.add(g.memberId()));
            int minutes =
                    due.detail().remindMinutes() == null ? 0 : due.detail().remindMinutes();
            String body = Words.dots(
                    minutes == 0 ? "Now" : "In " + Words.span(minutes),
                    due.detail().startTime() == null
                            ? null
                            : Words.time(due.detail().startTime()),
                    due.detail().placeWords());
            for (UUID user : pushes.mayHear(due.id(), hear)) {
                outbox.tell(Push.to(user, PushKind.EVENT_SOON, due.title(), body, "/event/" + due.id())
                        .about(due.circleId(), due.id())
                        .once("event:" + due.id() + ":" + moment + ":" + user));
            }
        }

        List<DueReminder> dueReminders = reminders.takeDue(until, AT_ONCE);
        Map<UUID, List<UUID>> givenTo =
                reminders.people(dueReminders.stream().map(DueReminder::id).toList());
        for (DueReminder due : dueReminders) {
            Instant moment = due.detail().alertAt();
            if (moment.isBefore(notBefore)) {
                continue;
            }
            // Whoever has it now: whose turn it is, else everyone it is given to, else whoever made it.
            List<UUID> given = givenTo.getOrDefault(due.id(), List.of());
            UUID turn = due.detail().takesTurns() ? Turns.now(due.detail().turnMemberId(), given) : null;
            List<UUID> hear = turn != null ? List.of(turn) : given.isEmpty() ? List.of(due.ownerId()) : given;
            int minutes = due.detail().remindMinutes();
            String when = minutes == 0
                    ? (due.detail().dueTime() == null
                            ? "Due today"
                            : "Due at " + Words.time(due.detail().dueTime()))
                    : "Due in " + Words.span(minutes);
            String title = turn == null ? due.title() : turnTitle(due.title(), due.detail(), minutes);
            String body = turn == null ? when : turnBody(due, given, minutes == 0 ? null : when);
            for (UUID user : pushes.mayHear(due.id(), hear)) {
                outbox.tell(Push.to(user, PushKind.REMINDER_DUE, title, body, "/reminder/" + due.id())
                        .about(due.circleId(), due.id())
                        .once("reminder:" + due.id() + ":" + moment + ":" + user));
            }
        }
        return dueEvents.size() + dueReminders.size();
    }

    /** "Take the bins out tonight": a turn that is due now says which part of the day it is. */
    static String turnTitle(String title, ReminderRow reminder, int minutesBefore) {
        if (minutesBefore != 0) {
            return title;
        }
        return title + " " + Words.partOfDay(reminder.dueTime()).toLowerCase(Locale.ROOT);
    }

    /** "It's your turn. Alex has Friday.": whose it is now, and who has it the next time it comes round. */
    private String turnBody(DueReminder due, List<UUID> given, String when) {
        StringBuilder body = new StringBuilder(when == null ? "" : when + ". ").append("It's your turn.");
        ReminderRow r = due.detail();
        UUID next = Turns.after(r.turnMemberId(), given, 1);
        if (r.repeat() != null && r.dueOn() != null && next != null && given.size() > 1) {
            Person who = people.in(due.circleId()).get(next);
            LocalDate day = r.repeat().nextAfter(r.dueOn(), r.dueOn()).orElse(null);
            if (who != null && day != null) {
                body.append(" ")
                        .append(app.homeport.api.common.Names.first(who.name()))
                        .append(" has ")
                        .append(Words.weekdayNear(day, r.dueOn()))
                        .append(".");
            }
        }
        return body.toString();
    }
}
