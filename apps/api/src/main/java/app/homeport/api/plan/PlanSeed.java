package app.homeport.api.plan;

import app.homeport.api.list.ChecklistService;
import app.homeport.api.list.ChecklistService.ChecklistResponse;
import app.homeport.api.list.ChecklistService.ItemChange;
import app.homeport.api.page.PageService;
import app.homeport.api.plan.EventService.NewEvent;
import app.homeport.api.plan.EventService.NewGuest;
import app.homeport.api.plan.EventService.When;
import app.homeport.api.plan.GoalService.NewGoal;
import app.homeport.api.plan.GoalService.Source;
import app.homeport.api.plan.ReminderService.NewReminder;
import app.homeport.api.plan.ReminderService.Place;
import app.homeport.api.seed.SeedWorld;
import app.homeport.api.seed.Seeder;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChange;
import app.homeport.api.thing.ThingService.Hidden;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * The Linds' week as the Plan screens draw it, counted from the day the sample data is added: the dentist
 * today, the bins tonight on Nora's turn, swimming on Thursdays, the haircut and the dinner on Saturday, the
 * party after Mia's birthday (hidden from Mia), the reminders, and the five goals. Weekdays and distances are
 * kept ("Saturday", "20 weeks left") rather than the calendar dates of the drawings.
 */
@Component
@ConditionalOnProperty(name = "homeport.seed.enabled", havingValue = "true")
class PlanSeed implements Seeder {

    static final String ZONE = "Europe/Ljubljana";

    private final EventService events;
    private final ReminderService reminders;
    private final GoalService goals;
    private final ChecklistService checklists;
    private final PageService pages;
    private final ThingService things;

    PlanSeed(
            EventService events,
            ReminderService reminders,
            GoalService goals,
            ChecklistService checklists,
            PageService pages,
            ThingService things) {
        this.events = events;
        this.reminders = reminders;
        this.goals = goals;
        this.checklists = checklists;
        this.pages = pages;
        this.things = things;
    }

    @Override
    public int order() {
        return 10;
    }

    @Override
    public void seed(SeedWorld w) {
        LocalDate today = LocalDate.now(ZoneId.of(ZONE));
        events(w, today);
        reminders(w, today);
        goals(w, today);
    }

    // ---------- events ----------

    private void events(SeedWorld w, LocalDate today) {
        UUID linds = w.circle("linds");
        UUID nora = w.user("nora");
        UUID alex = w.user("alex");
        UUID mia = w.member("linds", "mia");
        UUID leo = w.member("linds", "leo");
        LocalDate saturday = today.with(TemporalAdjusters.next(DayOfWeek.SATURDAY));

        events.create(
                alex,
                new NewEvent(
                        linds,
                        "School run",
                        new When(today.minusWeeks(10), LocalTime.of(8, 0), null, LocalTime.of(8, 30), ZONE),
                        null,
                        null,
                        null,
                        null,
                        Recurrence.weekly(Weekday.MON, Weekday.TUE, Weekday.WED, Weekday.THU, Weekday.FRI),
                        List.of(new NewGuest(w.member("linds", "alex"), null, "drives", null)),
                        null,
                        Audience.CIRCLE),
                UUID.randomUUID());
        events.create(
                nora,
                new NewEvent(
                        linds,
                        "Dentist · Mia",
                        new When(today, LocalTime.of(15, 30), null, LocalTime.of(16, 15), ZONE),
                        "Trubarjeva 12",
                        null,
                        null,
                        null,
                        null,
                        List.of(
                                new NewGuest(mia, null, null, null),
                                new NewGuest(w.member("linds", "alex"), null, "is taking her", null)),
                        List.of(mia),
                        Audience.CIRCLE),
                UUID.randomUUID());
        events.create(
                nora,
                new NewEvent(
                        linds,
                        "Swimming · Mia",
                        new When(today.minusWeeks(10), LocalTime.of(17, 0), null, LocalTime.of(17, 45), ZONE),
                        null,
                        null,
                        null,
                        null,
                        Recurrence.weekly(Weekday.THU),
                        List.of(new NewGuest(mia, null, null, null)),
                        List.of(mia),
                        Audience.CIRCLE),
                UUID.randomUUID());
        // Where he went last time: what "Type it" suggests for the next haircut.
        events.create(
                nora,
                new NewEvent(
                        linds,
                        "Haircut · Leo",
                        new When(saturday.minusWeeks(6), LocalTime.of(10, 0), null, LocalTime.of(10, 30), ZONE),
                        "Barber Miha",
                        null,
                        null,
                        null,
                        null,
                        List.of(new NewGuest(leo, null, null, null)),
                        List.of(leo),
                        Audience.CIRCLE),
                UUID.randomUUID());
        events.create(
                nora,
                new NewEvent(
                        linds,
                        "Haircut · Leo",
                        new When(saturday, LocalTime.of(10, 0), null, LocalTime.of(10, 30), ZONE),
                        null,
                        null,
                        null,
                        60,
                        null,
                        List.of(new NewGuest(leo, null, null, null)),
                        List.of(leo),
                        Audience.CIRCLE),
                UUID.randomUUID());
        events.create(
                nora,
                new NewEvent(
                        linds,
                        "Dinner at Grandma Astrid's",
                        new When(saturday, LocalTime.of(18, 30), null, null, ZONE),
                        null,
                        "bring the cookies",
                        null,
                        null,
                        null,
                        List.of(
                                new NewGuest(w.member("linds", "nora"), null, null, Answer.GOING),
                                new NewGuest(w.member("linds", "alex"), null, null, Answer.GOING),
                                new NewGuest(mia, null, null, Answer.GOING),
                                new NewGuest(leo, null, null, Answer.GOING)),
                        null,
                        Audience.CIRCLE),
                UUID.randomUUID());
        party(w, nora, linds, mia, leo);
    }

    /** Mia's party, on the Saturday after her tenth birthday, with what it needs. Hidden from her until it is over. */
    private void party(SeedWorld w, UUID nora, UUID linds, UUID mia, UUID leo) {
        LocalDate birthday = w.jdbc()
                .sql("select birthday from members where id = :id")
                .param("id", mia)
                .query(LocalDate.class)
                .single()
                .plusYears(10);
        LocalDate day = birthday.with(TemporalAdjusters.next(DayOfWeek.SATURDAY));
        UUID party = events.create(
                        nora,
                        new NewEvent(
                                linds,
                                "Mia's 10th birthday party",
                                new When(day, LocalTime.of(14, 0), null, LocalTime.of(17, 0), ZONE),
                                "At home",
                                null,
                                w.photo("nora", "cake.jpg"),
                                null,
                                null,
                                List.of(
                                        new NewGuest(w.member("linds", "nora"), null, null, Answer.GOING),
                                        new NewGuest(w.member("linds", "alex"), null, null, Answer.GOING),
                                        new NewGuest(leo, null, null, Answer.GOING),
                                        new NewGuest(null, "Lea", null, Answer.GOING),
                                        new NewGuest(null, "Tina", null, Answer.GOING),
                                        new NewGuest(null, "Jan", null, Answer.GOING),
                                        new NewGuest(null, "Zala", null, Answer.GOING),
                                        new NewGuest(null, "Nik", null, Answer.GOING),
                                        new NewGuest(null, "Ema", null, Answer.GOING),
                                        new NewGuest(null, "Luka", null, null),
                                        new NewGuest(null, "Sara", null, null)),
                                List.of(mia),
                                Audience.CIRCLE),
                        UUID.randomUUID())
                .id();
        ChecklistResponse prep = checklists.create(
                nora,
                linds,
                "Party prep",
                Audience.CIRCLE,
                List.of(
                        "Cake",
                        "Send the invitations",
                        "Balloons",
                        "Candles",
                        "Party bags",
                        "Pizza for eight",
                        "Playlist",
                        "Tidy the living room",
                        "Hide the presents"),
                UUID.randomUUID());
        checklists.change(
                prep.items().get(0).id(),
                nora,
                new ItemChange(
                        null,
                        "Alex has the cake",
                        null,
                        null,
                        null,
                        w.member("linds", "alex"),
                        null,
                        true,
                        null,
                        null));
        for (int line = 1; line <= 3; line++) {
            checklists.change(
                    prep.items().get(line).id(),
                    nora,
                    new ItemChange(null, null, null, null, null, null, null, true, null, null));
        }
        ChecklistResponse gifts = checklists.create(
                nora,
                linds,
                "Gift ideas",
                Audience.CIRCLE,
                List.of("Roller skates, size 33", "Watercolour set", "Climbing course, 5 lessons"),
                UUID.randomUUID());
        checklists.change(
                gifts.items().get(0).id(),
                nora,
                new ItemChange(null, "Alex bought them", null, null, null, null, null, true, null, null));
        for (UUID thing : List.of(party, prep.id(), gifts.id())) {
            things.share(thing, nora, new AudienceChange(Audience.CIRCLE, null, null, List.of(new Hidden(mia, day))));
        }
        things.link(party, prep.id(), nora);
        things.link(party, gifts.id(), nora);
        w.jdbc()
                .sql("update thing_links set created_at = created_at + interval '1 second' where to_id = :gifts")
                .param("gifts", gifts.id())
                .update();
    }

    // ---------- reminders ----------

    private void reminders(SeedWorld w, LocalDate today) {
        UUID linds = w.circle("linds");
        UUID nora = w.user("nora");
        UUID noraHere = w.member("linds", "nora");
        UUID alexHere = w.member("linds", "alex");
        UUID mia = w.member("linds", "mia");
        UUID leo = w.member("linds", "leo");

        // Due today although it is "Tue and Fri": it is tonight on the screens. The tick makes Friday or Tuesday next.
        reminders.create(
                nora,
                new NewReminder(
                        linds,
                        "Take the bins out",
                        null,
                        today,
                        LocalTime.of(19, 0),
                        ZONE,
                        null,
                        Recurrence.weekly(Weekday.TUE, Weekday.FRI),
                        List.of(noraHere, alexHere),
                        true,
                        null,
                        null,
                        null,
                        Audience.CIRCLE),
                UUID.randomUUID());

        UUID form = reminders
                .create(
                        nora,
                        new NewReminder(
                                linds,
                                "Sign Mia's school trip form",
                                null,
                                today.with(TemporalAdjusters.next(DayOfWeek.FRIDAY)),
                                null,
                                ZONE,
                                null,
                                null,
                                null,
                                false,
                                null,
                                null,
                                List.of(mia),
                                null),
                        UUID.randomUUID())
                .id();
        things.link(
                form,
                pages.create(
                                nora,
                                linds,
                                "Trip form",
                                "Class 4B is going to the Postojna caves. Sign and return by Friday, with €12.",
                                null,
                                UUID.randomUUID())
                        .id(),
                nora);

        UUID car = reminders
                .create(
                        nora,
                        new NewReminder(
                                linds,
                                "Book the car service",
                                null,
                                null,
                                null,
                                ZONE,
                                null,
                                null,
                                List.of(alexHere),
                                false,
                                null,
                                null,
                                null,
                                null),
                        UUID.randomUUID())
                .id();
        // "Asked on Monday": the Monday before today.
        w.jdbc()
                .sql("update things set created_at = :at where id = :id")
                .param(
                        "at",
                        java.sql.Timestamp.from(today.with(TemporalAdjusters.previous(DayOfWeek.MONDAY))
                                .atTime(18, 20)
                                .atZone(ZoneId.of(ZONE))
                                .toInstant()))
                .param("id", car)
                .update();

        UUID biscuit = reminders
                .create(
                        nora,
                        new NewReminder(
                                linds,
                                "Feed Biscuit",
                                null,
                                today,
                                LocalTime.of(7, 30),
                                ZONE,
                                null,
                                Recurrence.every(Recurrence.Unit.DAY),
                                List.of(leo),
                                false,
                                null,
                                1,
                                null,
                                Audience.CIRCLE),
                        UUID.randomUUID())
                .id();
        reminders.tick(biscuit, nora, true, today, today);
        w.jdbc()
                .sql("update reminder_ticks set done_at = :at where thing_id = :id")
                .param(
                        "at",
                        java.sql.Timestamp.from(
                                today.atTime(7, 40).atZone(ZoneId.of(ZONE)).toInstant()))
                .param("id", biscuit)
                .update();

        reminders.create(
                nora,
                new NewReminder(
                        linds,
                        "Pick up the parcel",
                        null,
                        null,
                        null,
                        ZONE,
                        null,
                        null,
                        null,
                        false,
                        new Place("the post office", 46.0514, 14.5060, 200),
                        null,
                        null,
                        null),
                UUID.randomUUID());
        UUID shop = reminders
                .create(
                        nora,
                        new NewReminder(
                                linds,
                                "Milk and bread",
                                null,
                                null,
                                null,
                                ZONE,
                                null,
                                null,
                                List.of(alexHere),
                                false,
                                new Place("the shop", 46.0569, 14.5058, 150),
                                null,
                                null,
                                null),
                        UUID.randomUUID())
                .id();
        // Everything here is made in one moment; where no day decides, the lists are in the order things were made.
        w.jdbc()
                .sql("update things set created_at = created_at + interval '1 second' where id = :id")
                .param("id", shop)
                .update();

        LocalDate secondOfJanuary = LocalDate.of(today.getYear() + 1, 1, 2);
        reminders.create(
                nora,
                new NewReminder(
                        linds,
                        "Renew Mia's passport",
                        "It expires in August. The form is on the government site; she needs a new photo.",
                        secondOfJanuary,
                        null,
                        ZONE,
                        null,
                        null,
                        List.of(alexHere),
                        false,
                        null,
                        null,
                        List.of(mia),
                        null),
                UUID.randomUUID());
    }

    // ---------- goals ----------

    private void goals(SeedWorld w, LocalDate today) {
        UUID linds = w.circle("linds");
        UUID nora = w.user("nora");
        UUID noraHere = w.member("linds", "nora");
        UUID alexHere = w.member("linds", "alex");
        UUID mia = w.member("linds", "mia");
        UUID leo = w.member("linds", "leo");

        LocalDate by = today.plusWeeks(20);
        UUID norway = goals.create(
                        nora,
                        new NewGoal(
                                linds,
                                "Norway " + by.getYear(),
                                "Two weeks by train and ferry, paid for before we go",
                                "",
                                w.photo("nora", "lake.jpg"),
                                GoalUnit.MONEY,
                                "EUR",
                                null,
                                800_000L,
                                null,
                                HowFar.SOURCE,
                                today.minusWeeks(36),
                                by,
                                new Source(GoalSource.SHEET, "norway-budget/saved", "“Saved” in Norway budget"),
                                null,
                                null,
                                Audience.CIRCLE),
                        UUID.randomUUID(),
                        today)
                .id();
        put(norway, nora, noraHere, 38_000, "", today.minusDays(240));
        put(norway, nora, alexHere, 55_000, "", today.minusDays(210));
        put(norway, nora, noraHere, 48_000, "", today.minusDays(180));
        put(norway, nora, alexHere, 66_000, "", today.minusDays(150));
        put(norway, nora, noraHere, 25_000, "", today.minusDays(120));
        put(norway, nora, leo, 300, "from his piggy bank", today.minusDays(95));
        put(norway, nora, noraHere, 88_000, "", today.minusDays(60));
        put(norway, nora, alexHere, 60_000, "", today.minusDays(45));
        put(norway, nora, noraHere, 79_200, "", today.minusDays(30));
        put(norway, nora, alexHere, 85_000, "", today.minusDays(20));
        put(norway, nora, mia, 500, "from her pocket money", today.minusDays(12));
        put(norway, nora, alexHere, 15_000, "payday", today.minusDays(10));

        UUID books = goals.create(
                        nora,
                        new NewGoal(
                                linds,
                                "Read 20 books",
                                "",
                                "📚",
                                null,
                                GoalUnit.COUNT,
                                null,
                                null,
                                20L,
                                null,
                                null,
                                today.minusWeeks(40),
                                null,
                                null,
                                null,
                                null,
                                Audience.CIRCLE),
                        UUID.randomUUID(),
                        today)
                .id();
        put(books, nora, noraHere, 6, "", today.minusDays(40));
        put(books, nora, alexHere, 4, "", today.minusDays(25));
        put(books, nora, mia, 3, "", today.minusDays(9));

        UUID run = goals.create(
                        nora,
                        new NewGoal(
                                linds,
                                "Family 10K",
                                "",
                                "🏃",
                                null,
                                GoalUnit.COUNT,
                                null,
                                "days",
                                30L,
                                null,
                                HowFar.SOURCE,
                                today.minusDays(12),
                                today.plusDays(18),
                                new Source(GoalSource.JOURNEY, "family-10k", "Family 10K in Journey"),
                                null,
                                null,
                                Audience.CIRCLE),
                        UUID.randomUUID(),
                        today)
                .id();
        put(run, nora, noraHere, 12, "", today);

        UUID car = goals.create(
                        nora,
                        new NewGoal(
                                linds,
                                "Pay off the car",
                                "",
                                "🚗",
                                null,
                                GoalUnit.MONEY,
                                "EUR",
                                null,
                                1_460_000L,
                                null,
                                null,
                                today.minusMonths(30),
                                null,
                                null,
                                null,
                                null,
                                Audience.CIRCLE),
                        UUID.randomUUID(),
                        today)
                .id();
        put(car, nora, noraHere, 1_050_000, "", today.minusDays(20));

        UUID skates = goals.create(
                        nora,
                        new NewGoal(
                                linds,
                                "Mia's skates fund",
                                "",
                                "⭐",
                                null,
                                GoalUnit.COUNT,
                                null,
                                "stars",
                                50L,
                                null,
                                null,
                                today.minusWeeks(12),
                                null,
                                null,
                                null,
                                null,
                                Audience.CIRCLE),
                        UUID.randomUUID(),
                        today)
                .id();
        put(skates, nora, mia, 34, "", today.minusDays(2));
        // Everything here is made in one moment; the list of goals is in the order they were made.
        int place = 0;
        for (UUID goal : List.of(norway, books, run, car, skates)) {
            w.jdbc()
                    .sql("update things set created_at = created_at + make_interval(secs => :place) where id = :id")
                    .param("place", place++)
                    .param("id", goal)
                    .update();
        }
    }

    private void put(UUID goal, UUID by, UUID forMember, long amount, String note, LocalDate day) {
        goals.addEntry(goal, by, amount, note, day, forMember, UUID.randomUUID());
    }
}
