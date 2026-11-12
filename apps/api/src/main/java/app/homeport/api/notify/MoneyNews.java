package app.homeport.api.notify;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Jobs;
import app.homeport.api.common.Names;
import app.homeport.api.money.BillService;
import app.homeport.api.money.BillService.BillResponse;
import app.homeport.api.money.BillStore.Reminder;
import app.homeport.api.money.Cash;
import app.homeport.api.money.split.ReminderAsked;
import app.homeport.api.notify.OutboxStore.Reachable;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Money sends nothing itself: it says who should be reminded, and this turns that into pushes. A bill that
 * asked to be remembered ("remind 2 days before") is told at eight in the morning, by each person's own
 * clock, to everyone whose share isn't paid. A tap on "Remind" in a split is told at once.
 */
@Component
public class MoneyNews {

    /** The hour of the morning, on the person's own clock, at which a bill is remembered. */
    static final LocalTime MORNING = LocalTime.of(8, 0);
    /** A morning that was missed (the API was away) is still caught up for this long. */
    static final Duration STILL_WORTH_IT = Duration.ofHours(12);

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEEE d MMM", Locale.ENGLISH);

    private final BillService bills;
    private final Outbox outbox;
    private final OutboxStore store;
    private final TransactionTemplate transaction;
    private final Jobs jobs;

    MoneyNews(BillService bills, Outbox outbox, OutboxStore store, TransactionTemplate transaction, Jobs jobs) {
        this.bills = bills;
        this.outbox = outbox;
        this.store = store;
        this.transaction = transaction;
        this.jobs = jobs;
    }

    /** Runs inside the transaction of the tap, so the push is queued exactly when the reminder is kept. */
    @EventListener
    void on(ReminderAsked asked) {
        Reachable to = store.reachable(List.of(asked.toMemberId())).get(asked.toMemberId());
        if (to == null) {
            return;
        }
        String by = Names.first(store.nameOf(asked.byMemberId()));
        outbox.tell(Push.to(
                        to.userId(),
                        PushKind.MONEY_REMINDER,
                        by + " reminds you about " + asked.title(),
                        "You owe " + Cash.exact(asked.cents(), asked.currency()),
                        "/split/" + asked.thingId())
                .about(asked.circleId(), asked.thingId())
                .by(asked.byMemberId()));
    }

    @Scheduled(cron = "${homeport.money.remind-cron:0 2/15 * * * *}", zone = "UTC")
    void everyQuarterHour() {
        Instant now = Instant.now();
        jobs.run("bill_reminders", now.truncatedTo(ChronoUnit.MINUTES).toString(), () -> remindOfBills(now));
    }

    /**
     * Queues a push for everyone whose morning has come on a day a bill asked to be remembered on. Each is
     * told once for each time a bill is due, however often this runs. Returns how many were queued.
     */
    public int remindOfBills(Instant now) {
        LocalDate utc = now.atZone(ZoneOffset.UTC).toLocalDate();
        Integer told = transaction.execute(status -> {
            int queued = 0;
            // The person's own day can be the one before or after the API's.
            for (LocalDate day : List.of(utc.minusDays(1), utc, utc.plusDays(1))) {
                List<Reminder> due = bills.remindersFor(day);
                Map<UUID, Reachable> people = store.reachable(
                        due.stream().map(Reminder::memberId).distinct().toList());
                for (Reminder reminder : due) {
                    Reachable who = people.get(reminder.memberId());
                    if (who == null) {
                        continue;
                    }
                    Instant morning = day.atTime(MORNING).atZone(who.zone()).toInstant();
                    if (morning.isAfter(now) || morning.plus(STILL_WORTH_IT).isBefore(now)) {
                        continue;
                    }
                    queued += tell(who, reminder, day) ? 1 : 0;
                }
            }
            return queued;
        });
        return told == null ? 0 : told;
    }

    private boolean tell(Reachable who, Reminder reminder, LocalDate today) {
        BillResponse bill;
        try {
            bill = bills.get(reminder.thingId(), who.userId());
        } catch (ApiProblem notTheirsToSee) {
            return false;
        }
        String when = when(reminder.dueOn(), today);
        String amount = Cash.exact(reminder.amountCents(), reminder.currency());
        boolean shared = bill.myShare() != null && bill.shares().size() > 1;
        String mine = !shared
                ? null
                : (bill.shares().size() == 2 && bill.myShare().cents() * 2 == reminder.amountCents()
                                ? "Your half is "
                                : "Your share is ")
                        + Cash.exact(bill.myShare().cents(), reminder.currency());
        return outbox.tell(Push.to(
                        who.userId(),
                        PushKind.BILL_DUE,
                        reminder.title() + " is due " + when,
                        mine == null ? amount : amount + " · " + mine,
                        "/bill/" + reminder.thingId())
                .quiet("A bill is due " + when, PushKind.BILL_DUE.quietBody())
                .about(reminder.circleId(), reminder.thingId())
                .once("bill_due:" + reminder.thingId() + ":" + reminder.dueOn() + ":" + reminder.memberId()));
    }

    /** "today", "tomorrow", or "on Thursday 12 Nov". */
    static String when(LocalDate dueOn, LocalDate today) {
        long away = ChronoUnit.DAYS.between(today, dueOn);
        return away == 0 ? "today" : away == 1 ? "tomorrow" : "on " + DAY.format(dueOn);
    }
}
