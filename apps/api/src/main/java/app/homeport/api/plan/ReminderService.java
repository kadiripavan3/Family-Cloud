package app.homeport.api.plan;

import app.homeport.api.circle.MemberKind;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.notify.Outbox;
import app.homeport.api.notify.Push;
import app.homeport.api.notify.PushDelivery;
import app.homeport.api.notify.PushKind;
import app.homeport.api.plan.PlanPeople.Person;
import app.homeport.api.plan.ReminderStore.Reminder;
import app.homeport.api.plan.ReminderStore.ReminderRow;
import app.homeport.api.plan.ReminderStore.TickRow;
import app.homeport.api.plan.ReminderStore.Ticked;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChip;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Reminders: something to do. The rules:
 *
 * <ul>
 *   <li>It is due on a day (maybe at a time), or it waits for a place, or neither ("some time").
 *   <li>It can be given to people of the circle. Giving it shows it to them, and whoever it is given to may
 *       tick it even when they may not change it.
 *   <li>One that repeats has one due day at a time. Ticking it writes down the tick and makes the next time
 *       round due; taking the tick away puts it back. A due day is ticked once, so a tick sent twice counts once.
 *   <li>One that takes turns belongs to one of its people at a time, in their order; each tick hands it on.
 *   <li>Whoever has it now is who it is "yours" for: whose turn it is, else everyone it is given to, else
 *       whoever made it.
 * </ul>
 */
@Service
public class ReminderService {

    static final int MAX_PEOPLE = 30;

    public record PlaceResponse(
            @Schema(description = "The place in words: the post office")
            String words,

            @Schema(nullable = true) Double lat,
            @Schema(nullable = true) Double lng,

            @Schema(nullable = true, description = "How near counts, in metres")
            Integer radiusM) {}

    public record ReminderResponse(
            UUID id,
            UUID circleId,
            String title,
            String notes,
            @Schema(nullable = true) LocalDate dueOn,

            @Schema(nullable = true, type = "string", example = "19:00") @JsonFormat(pattern = "HH:mm")
            LocalTime dueTime,

            String timeZone,

            @Schema(nullable = true, description = "The moment it is due. Null without a day.")
            Instant dueAt,

            @Schema(description = "A push this many minutes before it is due; 0 for when it is due")
            int remindMinutes,

            @Schema(nullable = true, description = "Null: it is done once")
            RepeatResponse repeat,

            boolean takesTurns,

            @Schema(nullable = true, description = "Whose turn it is")
            PersonBrief turn,

            @Schema(nullable = true, description = "Whose turn it is after that")
            PersonBrief then,

            @Schema(description = "Who it is given to, in the order they take turns. Empty: whoever made it does it.")
            List<PersonBrief> givenTo,

            @Schema(nullable = true, description = "Who made it")
            PersonBrief askedBy,

            @Schema(nullable = true, description = "For one that waits for a place. The phone watches the place.")
            PlaceResponse place,

            @Schema(description = "How many stars doing it earns")
            int stars,

            @Schema(description = "Done for good, or, for one that repeats, ticked for the day asked about")
            boolean done,

            @Schema(nullable = true) Instant doneAt,
            @Schema(nullable = true) PersonBrief doneBy,

            @Schema(
                    nullable = true,
                    description = "The due day the last tick was for: send it back to take the tick away")
            LocalDate tickedDueOn,

            @Schema(description = "True when it is the signed-in person's to do now")
            boolean yours,

            @Schema(description = "True when the signed-in person made it and someone else has it now")
            boolean asked,

            boolean canTick,

            @Schema(description = "True when a nudge can be sent now")
            boolean canNudge,

            @Schema(description = "The small line under the title: 19:00 · Tue and Fri · takes turns")
            String note,

            NoteIcon noteIcon,

            @Schema(description = "The titles of what is linked to it")
            List<String> attached,

            Instant createdAt,
            Instant updatedAt,
            boolean mine,
            boolean canEdit,
            AudienceChip chip) {}

    /** The reminders that are yours on one day. A null day holds the ones without a day. */
    public record DayGroupResponse(@Schema(nullable = true) LocalDate day, List<ReminderResponse> reminders) {}

    public record RemindersResponse(
            LocalDate day,

            @Schema(description = "How many are yours to do, with the ones that wait for a place")
            int yoursCount,

            @Schema(description = "How many you gave to someone else that aren't done")
            int askedCount,

            @Schema(description = "Yours, by day. What is overdue stands under today; no day comes last.")
            List<DayGroupResponse> yours,

            @Schema(description = "What you gave to someone else, with what they did today")
            List<ReminderResponse> asked,

            @Schema(description = "Yours and asked that wait for a place instead of a time")
            List<ReminderResponse> places) {}

    /** One time a reminder was ticked, for the list of what is done. */
    public record DoneResponse(
            UUID tickId,
            UUID reminderId,
            String title,
            Instant doneAt,
            @Schema(nullable = true) PersonBrief doneBy,

            @Schema(nullable = true, description = "Whose job it was")
            PersonBrief doneFor,

            @Schema(nullable = true) LocalDate dueOn,
            int stars,
            boolean mine,
            boolean canEdit,
            AudienceChip chip) {}

    /** A place to wait for. The point is optional: without it the reminder only says the words. */
    public record Place(String words, Double lat, Double lng, Integer radiusM) {}

    public record NewReminder(
            UUID circleId,
            String title,
            String notes,
            LocalDate dueOn,
            LocalTime dueTime,
            String timeZone,
            Integer remindMinutes,
            Recurrence repeat,
            List<UUID> givenTo,
            boolean takesTurns,
            Place place,
            Integer stars,
            List<UUID> about,
            Audience audience) {}

    public record ReminderChange(
            String title,
            String notes,
            LocalDate dueOn,
            LocalTime dueTime,
            String timeZone,
            boolean removeDue,
            Integer remindMinutes,
            Recurrence repeat,
            boolean stopRepeating,
            List<UUID> givenTo,
            Boolean takesTurns,
            UUID turn,
            Place place,
            boolean removePlace,
            Integer stars) {}

    private final ThingService things;
    private final ThingStore thingStore;
    private final ReminderStore reminders;
    private final PlanPeople people;
    private final Giving giving;
    private final PlanPushes pushes;
    private final Outbox outbox;
    private final PushDelivery delivery;
    private final TransactionTemplate transaction;

    ReminderService(
            ThingService things,
            ThingStore thingStore,
            ReminderStore reminders,
            PlanPeople people,
            Giving giving,
            PlanPushes pushes,
            Outbox outbox,
            PushDelivery delivery,
            TransactionTemplate transaction) {
        this.things = things;
        this.thingStore = thingStore;
        this.reminders = reminders;
        this.people = people;
        this.giving = giving;
        this.pushes = pushes;
        this.outbox = outbox;
        this.delivery = delivery;
        this.transaction = transaction;
    }

    // ---------- making and changing ----------

    @Transactional
    public ReminderResponse create(UUID me, NewReminder input, UUID clientId) {
        UUID id = things.create(me, input.circleId(), ThingKind.REMINDER, input.title(), input.audience(), clientId);
        if (thingStore.isNew(id, "reminders")) {
            ThingRow row = things.require(id, me, ThingKind.REMINDER);
            List<UUID> given = given(people.in(row.circleId()), input.givenTo());
            Place place = input.place();
            ReminderRow fresh = checked(
                    new ReminderRow(
                            id,
                            input.dueOn(),
                            input.dueTime(),
                            input.timeZone(),
                            input.notes() == null ? "" : input.notes().trim(),
                            input.remindMinutes() == null ? 0 : input.remindMinutes(),
                            input.repeat(),
                            input.takesTurns(),
                            input.takesTurns() && !given.isEmpty() ? given.get(0) : null,
                            place == null || place.words() == null ? "" : clean(place.words()),
                            place == null ? null : place.lat(),
                            place == null ? null : place.lng(),
                            place == null ? null : place.radiusM(),
                            input.stars() == null ? 0 : input.stars(),
                            null,
                            null,
                            null,
                            null),
                    given);
            reminders.insert(id, fresh);
            reminders.givenTo(id, given);
            giving.showTo(row, me, given);
            if (input.about() != null && !input.about().isEmpty()) {
                things.setAbout(id, me, input.about());
            }
        }
        return get(id, me, null);
    }

    @Transactional
    public ReminderResponse change(UUID id, UUID me, ReminderChange change) {
        ThingRow row = things.requireEdit(id, me, ThingKind.REMINDER);
        ReminderRow r = reminders.find(id).orElseThrow(ThingService::notFound);
        List<UUID> before = reminders.people(List.of(id)).getOrDefault(id, List.of());
        List<UUID> given = change.givenTo() == null ? before : given(people.in(row.circleId()), change.givenTo());
        boolean takesTurns = change.takesTurns() == null ? r.takesTurns() : change.takesTurns();
        if (change.turn() != null && !given.contains(change.turn())) {
            throw ApiProblem.badRequest("not_their_turn", "Choose one of the people who take turns.");
        }
        boolean newDue = change.dueOn() != null;
        Place place = change.place();
        boolean newPlace = place != null && place.words() != null;
        ReminderRow next = checked(
                new ReminderRow(
                        id,
                        change.removeDue() ? null : newDue ? change.dueOn() : r.dueOn(),
                        change.removeDue() ? null : newDue ? change.dueTime() : r.dueTime(),
                        change.timeZone() == null ? r.timeZone() : change.timeZone(),
                        change.notes() == null ? r.notes() : change.notes().trim(),
                        change.remindMinutes() == null ? r.remindMinutes() : change.remindMinutes(),
                        change.stopRepeating() || change.removeDue()
                                ? null
                                : change.repeat() == null ? r.repeat() : change.repeat(),
                        takesTurns,
                        !takesTurns ? null : change.turn() != null ? change.turn() : Turns.now(r.turnMemberId(), given),
                        change.removePlace() ? "" : newPlace ? clean(place.words()) : r.placeWords(),
                        change.removePlace() ? null : newPlace ? place.lat() : r.placeLat(),
                        change.removePlace() ? null : newPlace ? place.lng() : r.placeLng(),
                        change.removePlace() ? null : newPlace ? place.radiusM() : r.placeRadiusM(),
                        change.stars() == null ? r.stars() : change.stars(),
                        r.doneAt(),
                        r.doneBy(),
                        r.nudgedAt(),
                        null),
                given);
        reminders.save(id, next);
        if (!given.equals(before)) {
            reminders.givenTo(id, given);
            giving.showTo(row, me, given);
        }
        thingStore.retitle(
                id, change.title() == null ? row.title() : change.title().trim());
        return get(id, me, null);
    }

    /** The people a reminder is given to, each once and each of the circle. A pet can't be given a job. */
    private static List<UUID> given(Map<UUID, Person> circle, List<UUID> memberIds) {
        List<UUID> given = PlanPeople.chosen(circle, memberIds);
        if (given.size() > MAX_PEOPLE) {
            throw ApiProblem.badRequest("too_many_people", "Give it to 30 people at most.");
        }
        if (given.stream().anyMatch(id -> circle.get(id).kind() == MemberKind.PET)) {
            throw ApiProblem.badRequest("not_a_person", "A pet can't be given a job. Give it to a person.");
        }
        return given;
    }

    /** A reminder as it may be kept, with the moment of its push worked out. */
    private static ReminderRow checked(ReminderRow r, List<UUID> given) {
        PlanSql.zone(r.timeZone());
        if (r.dueTime() != null && r.dueOn() == null) {
            throw ApiProblem.badRequest("time_without_day", "Choose a day for that time.");
        }
        Recurrence repeat = r.repeat();
        if (repeat != null) {
            if (r.dueOn() == null) {
                throw ApiProblem.badRequest("repeat_without_day", "Something that repeats needs a first day.");
            }
            repeat = repeat.startingOn(r.dueOn());
            if (repeat.until() != null && repeat.until().isBefore(r.dueOn())) {
                throw ApiProblem.badRequest("repeat_ends_early", "It can't stop repeating before it starts.");
            }
        }
        if (r.takesTurns() && repeat == null) {
            throw ApiProblem.badRequest("turns_without_repeat", "Something that takes turns has to repeat.");
        }
        if (r.takesTurns() && given.size() < 2) {
            throw ApiProblem.badRequest("turns_need_two", "Taking turns needs two or more people.");
        }
        if ((r.placeLat() == null) != (r.placeLng() == null)) {
            throw ApiProblem.badRequest("half_a_place", "We couldn't read where that place is. Choose it again.");
        }
        if (r.placeLat() != null && r.placeWords().isEmpty()) {
            throw ApiProblem.badRequest("place_without_name", "Say what the place is: the post office, the shop.");
        }
        ReminderRow kept = new ReminderRow(
                r.id(),
                r.dueOn(),
                r.dueTime(),
                r.timeZone().trim(),
                r.notes(),
                r.remindMinutes(),
                repeat,
                r.takesTurns(),
                r.takesTurns() ? r.turnMemberId() : null,
                r.placeWords(),
                r.placeLat(),
                r.placeLng(),
                r.placeLat() == null ? null : r.placeRadiusM() == null ? Integer.valueOf(200) : r.placeRadiusM(),
                r.stars(),
                r.doneAt(),
                r.doneBy(),
                r.nudgedAt(),
                null);
        return withAlert(kept, Alerts.forReminder(kept, Instant.now()));
    }

    private static ReminderRow withAlert(ReminderRow r, Instant alertAt) {
        return new ReminderRow(
                r.id(),
                r.dueOn(),
                r.dueTime(),
                r.timeZone(),
                r.notes(),
                r.remindMinutes(),
                r.repeat(),
                r.takesTurns(),
                r.turnMemberId(),
                r.placeWords(),
                r.placeLat(),
                r.placeLng(),
                r.placeRadiusM(),
                r.stars(),
                r.doneAt(),
                r.doneBy(),
                r.nudgedAt(),
                alertAt);
    }

    // ---------- ticking ----------

    /**
     * Ticks a reminder, or takes the tick away. {@code dueOn} is the due day the phone was looking at: when
     * the reminder has moved on from it (the tick already arrived once) nothing more happens. {@code today}
     * is the day on the phone: one that repeats is next due after it.
     */
    @Transactional
    public ReminderResponse tick(UUID id, UUID me, boolean done, LocalDate dueOn, LocalDate today) {
        LocalDate day = today == null ? LocalDate.now() : today;
        ThingRow row = things.require(id, me, ThingKind.REMINDER);
        ReminderRow r = reminders.find(id).orElseThrow(ThingService::notFound);
        UUID mine = myMember(people.in(row.circleId()), me);
        List<UUID> given = reminders.people(List.of(id)).getOrDefault(id, List.of());
        if (!row.canEdit() && !given.contains(mine)) {
            throw new ApiProblem(HttpStatus.FORBIDDEN, "view_only", "You can look at this, but not change it.");
        }
        if (done) {
            tickOff(row, r, given, mine, dueOn, day);
        } else {
            takeTickAway(r, given, dueOn);
        }
        thingStore.touch(id);
        return get(id, me, day);
    }

    private void tickOff(ThingRow row, ReminderRow r, List<UUID> given, UUID by, LocalDate dueOn, LocalDate today) {
        if (r.doneAt() != null || (dueOn != null && !dueOn.equals(r.dueOn()))) {
            return; // done already, or it has moved on from the day the phone was looking at
        }
        UUID whose = r.takesTurns()
                ? Turns.now(r.turnMemberId(), given)
                : given.size() == 1 ? given.get(0) : given.contains(by) ? by : given.isEmpty() ? row.ownerId() : null;
        if (!reminders.tick(r.id(), r.dueOn(), by, whose, r.stars())) {
            return;
        }
        Optional<LocalDate> next = r.repeat() == null
                ? Optional.empty()
                : r.repeat().nextAfter(r.dueOn(), today.isAfter(r.dueOn()) ? today : r.dueOn());
        if (next.isEmpty()) {
            reminders.finish(r.id(), by);
            return;
        }
        UUID turn = r.takesTurns() ? Turns.after(r.turnMemberId(), given, 1) : null;
        reminders.dueOn(r.id(), next.get(), turn, Alerts.forReminder(moved(r, next.get()), Instant.now()));
    }

    private void takeTickAway(ReminderRow r, List<UUID> given, LocalDate dueOn) {
        Optional<TickRow> last = reminders.lastTick(r.id());
        if (last.isEmpty() || (dueOn != null && !dueOn.equals(last.get().dueOn()))) {
            return; // nothing to take away, or not the tick the phone was looking at
        }
        reminders.removeTick(last.get().id());
        LocalDate back = last.get().dueOn();
        UUID turn = !r.takesTurns()
                ? null
                : r.doneAt() != null ? Turns.now(r.turnMemberId(), given) : Turns.before(r.turnMemberId(), given);
        reminders.dueOn(r.id(), back, turn, back == null ? null : Alerts.forReminder(moved(r, back), Instant.now()));
    }

    /** The same reminder, open, on another due day: what its next push is worked out from. */
    private static ReminderRow moved(ReminderRow r, LocalDate dueOn) {
        return new ReminderRow(
                r.id(),
                dueOn,
                r.dueTime(),
                r.timeZone(),
                r.notes(),
                r.remindMinutes(),
                r.repeat(),
                r.takesTurns(),
                r.turnMemberId(),
                r.placeWords(),
                r.placeLat(),
                r.placeLng(),
                r.placeRadiusM(),
                r.stars(),
                null,
                null,
                r.nudgedAt(),
                null);
    }

    // ---------- nudging ----------

    /**
     * A gentle push to whoever has a reminder you made, once an hour at most. It goes into the outbox in the
     * same short transaction that notes the nudge; no transaction is open while the push is handed over.
     */
    public void nudge(UUID id, UUID me) {
        ThingRow row = things.requireOwner(id, me);
        if (row.kind() != ThingKind.REMINDER) {
            throw ThingService.notFound();
        }
        ReminderRow r = reminders.find(id).orElseThrow(ThingService::notFound);
        Map<UUID, Person> circle = people.in(row.circleId());
        UUID mine = myMember(circle, me);
        List<UUID> holders = holders(row, r, reminders.people(List.of(id)).getOrDefault(id, List.of())).stream()
                .filter(holder -> !holder.equals(mine))
                .toList();
        if (r.doneAt() != null || holders.isEmpty()) {
            throw ApiProblem.conflict("nobody_to_nudge", "There is nobody to nudge about this.");
        }
        String from = circle.get(mine).name();
        transaction.executeWithoutResult(status -> {
            if (!reminders.nudge(id)) {
                throw ApiProblem.conflict("nudged_already", "You nudged a moment ago. Give it an hour.");
            }
            for (UUID user : pushes.mayHear(id, holders)) {
                outbox.tell(Push.to(
                                user,
                                PushKind.REMINDER_NUDGE,
                                row.title(),
                                "A gentle nudge from " + from + ".",
                                "/reminder/" + id)
                        .about(row.circleId(), id)
                        .by(mine));
            }
        });
        // A nudge is for now: it is sent straight away, and tried again by the outbox when the push service is away.
        delivery.deliverDue();
    }

    // ---------- reading ----------

    public ReminderResponse get(UUID id, UUID me, LocalDate day) {
        ThingRow row = things.require(id, me, ThingKind.REMINDER);
        ReminderRow r = reminders.find(id).orElseThrow(ThingService::notFound);
        LocalDate today = day == null ? LocalDate.now() : day;
        Reminder reminder = new Reminder(row, r);
        Seen seen = seen(row.circleId(), me, today, List.of(reminder));
        return view(reminder, seen);
    }

    /** What the Reminders screen shows: yours by day, what you asked of others, and the ones that wait for a place. */
    public RemindersResponse list(UUID circleId, UUID me, LocalDate day) {
        LocalDate today = day == null ? LocalDate.now() : day;
        List<Reminder> current = reminders.current(circleId, me);
        Seen seen = seen(circleId, me, today, current);
        Map<LocalDate, List<ReminderResponse>> byDay = new LinkedHashMap<>();
        List<ReminderResponse> someTime = new ArrayList<>();
        List<ReminderResponse> asked = new ArrayList<>();
        List<ReminderResponse> places = new ArrayList<>();
        int yoursCount = 0;
        int askedCount = 0;
        for (Reminder reminder : current) {
            ReminderResponse shown = view(reminder, seen);
            boolean open = reminder.detail().doneAt() == null && !shown.done();
            if (shown.yours() && open) {
                yoursCount++;
                if (shown.place() != null && shown.dueOn() == null) {
                    places.add(shown);
                } else if (shown.dueOn() == null) {
                    someTime.add(shown);
                } else {
                    // What is overdue is still to do: it stands with today's.
                    LocalDate under = shown.dueOn().isBefore(today) ? today : shown.dueOn();
                    byDay.computeIfAbsent(under, d -> new ArrayList<>()).add(shown);
                }
            } else if (shown.asked() && (open || seen.tickedToday().containsKey(shown.id()))) {
                if (open) {
                    askedCount++;
                }
                if (shown.place() != null && shown.dueOn() == null) {
                    places.add(shown);
                } else {
                    asked.add(shown);
                }
            }
        }
        List<DayGroupResponse> yours = new ArrayList<>(byDay.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(e -> new DayGroupResponse(e.getKey(), e.getValue()))
                .toList());
        if (!someTime.isEmpty()) {
            yours.add(new DayGroupResponse(null, someTime));
        }
        asked.sort(Comparator.comparing(ReminderResponse::done));
        return new RemindersResponse(today, yoursCount, askedCount, yours, asked, places);
    }

    /** What was ticked, last first. */
    public Page<DoneResponse> done(UUID circleId, UUID me, Keyset page) {
        List<Ticked> rows = reminders.done(circleId, me, page);
        Map<UUID, Person> circle = people.in(circleId);
        Map<UUID, AudienceChip> chips =
                things.chips(rows.stream().map(Ticked::thing).distinct().toList());
        return page.page(rows, t -> Keyset.cursor(t.tick().doneAt(), t.tick().id()))
                .map(shown -> shown.stream()
                        .map(t -> new DoneResponse(
                                t.tick().id(),
                                t.thing().id(),
                                t.thing().title(),
                                t.tick().doneAt(),
                                brief(circle, t.tick().doneBy()),
                                brief(circle, t.tick().doneFor()),
                                t.tick().dueOn(),
                                t.tick().stars(),
                                t.thing().mine(),
                                t.thing().canEdit(),
                                chips.get(t.thing().id())))
                        .toList());
    }

    // ---------- how one viewer sees reminders ----------

    /** Everything it takes to show reminders of one circle to one person on one day, fetched once for all of them. */
    record Seen(
            UUID me,
            UUID myMember,
            LocalDate today,
            Map<UUID, Person> people,
            Map<UUID, List<UUID>> givenTo,
            Map<UUID, List<String>> attached,
            Map<UUID, TickRow> tickedToday,
            Map<UUID, AudienceChip> chips) {}

    Seen seen(UUID circleId, UUID me, LocalDate today, List<Reminder> shown) {
        Map<UUID, Person> circle = people.in(circleId);
        List<UUID> ids = shown.stream().map(r -> r.thing().id()).toList();
        Map<UUID, TickRow> tickedToday = reminders.ticked(circleId, me, today, today).stream()
                .collect(Collectors.toMap(t -> t.thing().id(), Ticked::tick, (first, later) -> later));
        return new Seen(
                me,
                myMember(circle, me),
                today,
                circle,
                reminders.people(ids),
                reminders.attached(ids, me),
                tickedToday,
                things.chips(shown.stream().map(Reminder::thing).toList()));
    }

    /** Who has a reminder now: whose turn it is, else everyone it is given to, else whoever made it. */
    static List<UUID> holders(ThingRow thing, ReminderRow r, List<UUID> given) {
        if (r.takesTurns()) {
            UUID turn = Turns.now(r.turnMemberId(), given);
            return turn == null ? List.of(thing.ownerId()) : List.of(turn);
        }
        return given.isEmpty() ? List.of(thing.ownerId()) : given;
    }

    ReminderResponse view(Reminder reminder, Seen seen) {
        ThingRow thing = reminder.thing();
        ReminderRow r = reminder.detail();
        List<UUID> given = seen.givenTo().getOrDefault(thing.id(), List.of());
        List<UUID> holders = holders(thing, r, given);
        TickRow ticked = seen.tickedToday().get(thing.id());
        boolean done = r.doneAt() != null || ticked != null;
        boolean yours = holders.contains(seen.myMember());
        boolean asked = thing.mine() && !yours;
        UUID turn = r.takesTurns() ? Turns.now(r.turnMemberId(), given) : null;
        UUID then = r.takesTurns() ? Turns.after(r.turnMemberId(), given, 1) : null;
        List<String> attached = seen.attached().getOrDefault(thing.id(), List.of());
        boolean canNudge = asked
                && r.doneAt() == null
                && ticked == null
                && (r.nudgedAt() == null || r.nudgedAt().isBefore(Instant.now().minus(Duration.ofHours(1))))
                && holders.stream().anyMatch(h -> {
                    Person holder = seen.people().get(h);
                    return holder != null && holder.userId() != null;
                });
        return new ReminderResponse(
                thing.id(),
                thing.circleId(),
                thing.title(),
                r.notes(),
                r.dueOn(),
                r.dueTime(),
                r.timeZone(),
                r.dueOn() == null
                        ? null
                        : PlanSql.moment(r.dueOn(), r.dueTime() == null ? PlanSql.MORNING : r.dueTime(), r.timeZone()),
                r.remindMinutes(),
                RepeatResponse.of(r.repeat()),
                r.takesTurns(),
                brief(seen.people(), turn),
                brief(seen.people(), then),
                given.stream()
                        .map(id -> brief(seen.people(), id))
                        .filter(Objects::nonNull)
                        .toList(),
                brief(seen.people(), thing.ownerId()),
                r.atPlace() ? new PlaceResponse(r.placeWords(), r.placeLat(), r.placeLng(), r.placeRadiusM()) : null,
                r.stars(),
                done,
                ticked != null ? ticked.doneAt() : r.doneAt(),
                brief(seen.people(), ticked != null ? ticked.doneBy() : r.doneBy()),
                ticked == null ? null : ticked.dueOn(),
                yours,
                asked,
                thing.canEdit() || given.contains(seen.myMember()),
                canNudge,
                note(thing, r, seen, holders, yours, asked, ticked, attached),
                r.atPlace() && r.dueOn() == null
                        ? NoteIcon.PIN
                        : !attached.isEmpty() ? NoteIcon.CLIP : r.repeat() != null ? NoteIcon.REPEAT : NoteIcon.NONE,
                attached,
                thing.createdAt(),
                thing.updatedAt(),
                thing.mine(),
                thing.canEdit(),
                seen.chips().get(thing.id()));
    }

    /** The small line under a reminder on the Reminders screen. */
    private static String note(
            ThingRow thing,
            ReminderRow r,
            Seen seen,
            List<UUID> holders,
            boolean yours,
            boolean asked,
            TickRow ticked,
            List<String> attached) {
        LocalDate today = seen.today();
        Instant doneAt = ticked != null ? ticked.doneAt() : r.doneAt();
        if (doneAt != null) {
            int stars = ticked != null ? ticked.stars() : r.stars();
            return Words.dots(
                    "Done at "
                            + Words.time(doneAt.atZone(PlanSql.storedZone(r.timeZone()))
                                    .toLocalTime()),
                    stars > 0 ? Words.count(stars, "star") : null);
        }
        String with = attached.isEmpty()
                ? null
                : attached.size() == 1 ? attached.get(0) + " attached" : attached.size() + " things attached";
        String who = Words.list(holders.stream()
                .map(h -> seen.people().get(h))
                .filter(Objects::nonNull)
                .map(Person::name)
                .toList());
        if (r.atPlace() && r.dueOn() == null) {
            return Words.dots(
                    "When " + (yours || who.isEmpty() ? "you're" : who + (holders.size() == 1 ? " is" : " are"))
                            + " near " + r.placeWords(),
                    with);
        }
        String time = r.dueTime() == null ? null : Words.time(r.dueTime());
        String repeats = r.repeat() == null ? null : r.repeat().label();
        String due = r.repeat() != null || r.dueOn() == null || (r.dueOn().equals(today) && time != null)
                ? null
                : (r.dueOn().isBefore(today) ? "was due " : "due ") + Words.weekdayNear(r.dueOn(), today);
        if (asked) {
            LocalDate askedOn =
                    thing.createdAt().atZone(PlanSql.storedZone(r.timeZone())).toLocalDate();
            String day = Words.weekdayNear(askedOn, today);
            String since = "Asked " + (day.equals("today") || day.equals("yesterday") ? day : "on " + day);
            if (r.takesTurns()) {
                return Words.dots(time, repeats, who.isEmpty() ? null : who + "'s turn");
            }
            return Words.dots(
                    since, due == null && time == null && repeats == null ? "not done yet" : null, due, time, repeats);
        }
        // Something someone else gave you says who it is from.
        Person owner = seen.people().get(thing.ownerId());
        String from = yours && !thing.mine() && !r.takesTurns() && owner != null ? "from " + owner.name() : null;
        return Words.dots(with, time, repeats, r.takesTurns() ? "takes turns" : null, due, from);
    }

    private static UUID myMember(Map<UUID, Person> circle, UUID me) {
        return circle.values().stream()
                .filter(p -> me.equals(p.userId()))
                .map(Person::id)
                .findFirst()
                .orElseThrow(ThingService::notFound);
    }

    private static PersonBrief brief(Map<UUID, Person> circle, UUID memberId) {
        Person person = memberId == null ? null : circle.get(memberId);
        return person == null ? null : person.brief();
    }

    private static String clean(String text) {
        return text == null ? "" : text.trim().replaceAll("\\s+", " ");
    }
}
