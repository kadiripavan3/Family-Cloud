package app.homeport.api.plan;

import app.homeport.api.common.Jobs;
import app.homeport.api.notify.PushMessage;
import app.homeport.api.notify.PushSender;
import app.homeport.api.plan.EventStore.DueEvent;
import app.homeport.api.plan.EventStore.GuestRow;
import app.homeport.api.plan.ReminderStore.DueReminder;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
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
 * when it is due. Every minute, in three short steps:
 *
 * <ol>
 *   <li><b>Take.</b> In one transaction: lock the events and reminders whose moment has come, move each
 *       one's moment on (to the next time round, or to nothing), and work out who hears of it: the people
 *       who are coming or who have the job, as far as they may see it at this moment and haven't switched
 *       notifications off. Marking it here is what makes each push go out once.
 *   <li><b>Hand over.</b> With no transaction open, so no database connection waits on another company's
 *       server: one call to the push service per hundred pushes.
 *   <li><b>Put back.</b> Only when a call failed: the moment of the things in that call is set again, so
 *       the next minute tries them once more. A moment more than three hours old is let go instead.
 * </ol>
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

    /** One event or reminder that was taken: its pushes, and what to do if they can't be handed over. */
    private record Taken(UUID id, List<PushMessage> pushes, Runnable putBack) {}

    private final EventStore events;
    private final ReminderStore reminders;
    private final PlanPushes pushes;
    private final TransactionTemplate transaction;
    private final Jobs jobs;

    DuePushes(
            EventStore events, ReminderStore reminders, PlanPushes pushes, TransactionTemplate transaction, Jobs jobs) {
        this.events = events;
        this.reminders = reminders;
        this.pushes = pushes;
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
     * Sends the pushes for everything that is due at this moment. Returns how many events and reminders it
     * took. Safe to run in several copies of the API at once: each takes its own rows.
     */
    public int sendDue(Instant now) {
        List<Taken> taken = transaction.execute(status -> take(now));
        if (taken == null || taken.isEmpty()) {
            return 0;
        }
        // One call's worth at a time. A call that fails puts back only the things that had a push in it.
        List<PushMessage> call = new ArrayList<>();
        Set<Taken> inCall = new LinkedHashSet<>();
        for (Taken one : taken) {
            for (PushMessage push : one.pushes()) {
                call.add(push);
                inCall.add(one);
                if (call.size() == PushSender.PER_CALL) {
                    handOver(call, inCall);
                }
            }
        }
        handOver(call, inCall);
        return taken.size();
    }

    private void handOver(List<PushMessage> call, Set<Taken> inCall) {
        if (!call.isEmpty()) {
            try {
                pushes.send(call);
            } catch (RuntimeException unreachable) {
                log.warn(
                        "Couldn't hand {} pushes about what is due to the push service; they will be tried again: {}",
                        call.size(),
                        unreachable.toString());
                transaction.executeWithoutResult(
                        status -> inCall.forEach(one -> one.putBack().run()));
            }
        }
        call.clear();
        inCall.clear();
    }

    /** Step one. Everything whose moment has come, marked, with the pushes to hand over for it. */
    private List<Taken> take(Instant now) {
        Instant until = now.plus(AHEAD);
        Instant notBefore = now.minus(TOO_LATE);
        List<Taken> taken = new ArrayList<>();

        List<DueEvent> dueEvents = events.lockDue(until, AT_ONCE);
        Map<UUID, List<GuestRow>> guests = events
                .guests(dueEvents.stream().map(DueEvent::id).toList())
                .stream()
                .collect(Collectors.groupingBy(GuestRow::eventId));
        for (DueEvent due : dueEvents) {
            Instant moment = due.detail().alertAt();
            Instant next = Alerts.forEvent(due.detail(), moment);
            events.alertAt(due.id(), next);
            if (moment.isBefore(notBefore)) {
                taken.add(new Taken(due.id(), List.of(), () -> {}));
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
            taken.add(new Taken(
                    due.id(),
                    pushes.messages(
                            pushes.mayHear(due.id(), hear), due.title(), body, "/event/" + due.id(), "event_soon"),
                    () -> events.alertAgain(due.id(), moment, next)));
        }

        List<DueReminder> dueReminders = reminders.takeDue(until, AT_ONCE);
        Map<UUID, List<UUID>> givenTo =
                reminders.people(dueReminders.stream().map(DueReminder::id).toList());
        for (DueReminder due : dueReminders) {
            Instant moment = due.detail().alertAt();
            if (moment.isBefore(notBefore)) {
                taken.add(new Taken(due.id(), List.of(), () -> {}));
                continue;
            }
            // Whoever has it now: whose turn it is, else everyone it is given to, else whoever made it.
            List<UUID> given = givenTo.getOrDefault(due.id(), List.of());
            UUID turn = due.detail().takesTurns() ? Turns.now(due.detail().turnMemberId(), given) : null;
            List<UUID> hear = turn != null ? List.of(turn) : given.isEmpty() ? List.of(due.ownerId()) : given;
            int minutes = due.detail().remindMinutes();
            String body = Words.dots(
                    minutes == 0
                            ? (due.detail().dueTime() == null
                                    ? "Due today"
                                    : "Due at " + Words.time(due.detail().dueTime()))
                            : "Due in " + Words.span(minutes),
                    turn != null ? "your turn" : null);
            taken.add(new Taken(
                    due.id(),
                    pushes.messages(
                            pushes.mayHear(due.id(), hear), due.title(), body, "/reminder/" + due.id(), "reminder_due"),
                    () -> reminders.alertAgain(due.id(), moment)));
        }
        return taken;
    }
}
