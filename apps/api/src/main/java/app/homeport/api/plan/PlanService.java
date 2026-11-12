package app.homeport.api.plan;

import app.homeport.api.circle.MemberKind;
import app.homeport.api.home.TodaySource.TodayItem;
import app.homeport.api.plan.EventStore.Event;
import app.homeport.api.plan.EventStore.EventRow;
import app.homeport.api.plan.EventStore.GuestRow;
import app.homeport.api.plan.PlanPeople.Person;
import app.homeport.api.plan.PlanSource.Dated;
import app.homeport.api.plan.ReminderStore.Reminder;
import app.homeport.api.plan.ReminderStore.ReminderRow;
import app.homeport.api.plan.ReminderStore.Ticked;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChip;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * The calendar: what falls on which day. The day's list, the week's dots, the month and Today are all read
 * from one place, {@link #lines}, so they can't disagree. What goes on a day:
 *
 * <ul>
 *   <li>an event, on every day it covers and every time it comes round;
 *   <li>a reminder, on the day it is due; one that repeats also on the days it will come round after that
 *       (with whose turn it will be then), and on the days gone by where it was ticked;
 *   <li>what other places bring ({@link PlanSource}): a bill on the day it is due.
 * </ul>
 *
 * Whose a line is decides its coloured dot: the first person an event is for, whoever has a reminder now;
 * a line for three or more people is everyone's.
 */
@Service
public class PlanService {

    static final int MAX_DAYS = 62;

    /** Whose something is: their tint is the colour of its dot. */
    public record WhoseResponse(UUID memberId, String name, int tint) {}

    public record PlanEntryResponse(
            @Schema(nullable = true, description = "The thing behind the line")
            UUID thingId,

            ThingKind kind,
            String title,
            LocalDate day,

            @Schema(
                    nullable = true,
                    description = "What stands in front: 15:30, All day, €84. Null for a job with only a tick.")
            String lead,

            @Schema(nullable = true, description = "The small time under it: when it ends")
            String leadEnd,

            @Schema(nullable = true, description = "For something that can be ticked: whether it is. Null otherwise.")
            Boolean done,

            @Schema(
                    description = "True when the signed-in person may tick it here, or, for a line that is done, take"
                            + " its tick away again. Send dueOn with the tick.")
            boolean canTick,

            @Schema(
                    nullable = true,
                    description = "The day it is due: the day a bill is to be paid by, the due day of a job (for a"
                            + " job that is done, the due day that was ticked; send it back to take that tick away)."
                            + " Null for something with no due day, such as an event.")
            LocalDate dueOn,

            @Schema(description = "The small line under the title: Weekdays · Alex drives")
            String note,

            NoteIcon noteIcon,

            @Schema(nullable = true, description = "What its button says, when it has one: Pay")
            String action,

            @Schema(description = "True for something that comes round again")
            boolean repeats,

            @Schema(nullable = true, description = "Whose it is, for the coloured dot. Null: everyone's.")
            WhoseResponse whose,

            @Schema(description = "The faces next to it, three at most")
            List<String> avatarUrls,

            @Schema(description = "Sorts the day: minutes since midnight, or 1440 for something with no time")
            int minute,

            boolean mine,
            boolean canEdit,

            @Schema(nullable = true, description = "Null for a line another place brought")
            AudienceChip chip) {}

    /** One dot under a day: someone's tint, or tint 0 with no member for something that is everyone's. */
    public record DotResponse(@Schema(nullable = true) UUID memberId, int tint) {}

    public record DayDotsResponse(LocalDate day, List<DotResponse> dots) {}

    public record PlanDayResponse(LocalDate day, List<PlanEntryResponse> entries) {}

    public record PlanResponse(
            LocalDate day,

            @Schema(description = "The week the day is in, Monday first, with a dot per person who has something")
            List<DayDotsResponse> week,

            @Schema(description = "The day asked for and the days after it, each with its lines in order of time")
            List<PlanDayResponse> days,

            @Schema(
                    description = "Reminders that were due before that day and are still open, each on the day it was"
                            + " due. They are still to do: when the day asked for is today, they belong on top.")
            List<PlanEntryResponse> overdue) {}

    public record MonthDayResponse(
            LocalDate day,

            @Schema(description = "False for the days of the months before and after that fill the grid")
            boolean inMonth,

            List<DotResponse> dots) {}

    public record MonthResponse(
            @Schema(example = "2026-11") String month,

            @Schema(description = "Whole weeks, Monday first, that hold the month")
            List<MonthDayResponse> days) {}

    /** One line on one day with everything the day's list, the month and Today each need of it. */
    record Line(
            ThingRow thing,
            UUID thingId,
            ThingKind kind,
            String title,
            LocalDate day,
            String lead,
            String leadEnd,
            Boolean done,
            boolean canTick,
            String note,
            NoteIcon icon,
            String todayNote,
            WhoseResponse whose,
            List<UUID> concerns,
            List<String> avatars,
            int minute,
            boolean forMe,
            LocalDate dueOn,
            String action,
            boolean repeats) {}

    private final EventStore events;
    private final ReminderStore reminders;
    private final PlanPeople people;
    private final ThingService things;
    private final List<PlanSource> sources;
    private final app.homeport.api.media.MediaService media;

    PlanService(
            EventStore events,
            ReminderStore reminders,
            PlanPeople people,
            ThingService things,
            List<PlanSource> sources,
            app.homeport.api.media.MediaService media) {
        this.events = events;
        this.reminders = reminders;
        this.people = people;
        this.things = things;
        this.sources = sources;
        this.media = media;
    }

    // ---------- what the screens ask ----------

    /** The day's list from one day on, and the dots of the week that day is in. */
    public PlanResponse plan(UUID circleId, UUID me, LocalDate day, Integer days, UUID memberId) {
        LocalDate first = day == null ? LocalDate.now() : day;
        LocalDate last = first.plusDays(Math.clamp(days == null ? 7 : days, 1, MAX_DAYS) - 1L);
        LocalDate monday = first.minusDays(first.getDayOfWeek().getValue() - 1L);
        LocalDate sunday = monday.plusDays(6);
        List<Line> lines = only(
                lines(circleId, me, monday.isBefore(first) ? monday : first, sunday.isAfter(last) ? sunday : last),
                memberId);
        Map<UUID, AudienceChip> chips = chips(lines);
        List<DayDotsResponse> week = new ArrayList<>();
        for (LocalDate d = monday; !d.isAfter(sunday); d = d.plusDays(1)) {
            week.add(new DayDotsResponse(d, dots(lines, d)));
        }
        List<PlanDayResponse> shown = new ArrayList<>();
        for (LocalDate d = first; !d.isAfter(last); d = d.plusDays(1)) {
            LocalDate on = d;
            List<PlanEntryResponse> entries = lines.stream()
                    .filter(line -> line.day().equals(on))
                    .map(line -> entry(line, chips))
                    .toList();
            if (!entries.isEmpty() || d.equals(first)) {
                shown.add(new PlanDayResponse(d, entries));
            }
        }
        List<Line> late = only(overdue(circleId, me, first), memberId);
        Map<UUID, AudienceChip> lateChips = chips(late);
        return new PlanResponse(
                first,
                week,
                shown,
                late.stream().map(line -> entry(line, lateChips)).toList());
    }

    /** A month as a grid of whole weeks, each day with a dot per person who has something on it. */
    public MonthResponse month(UUID circleId, UUID me, YearMonth month, UUID memberId) {
        YearMonth of = month == null ? YearMonth.now() : month;
        LocalDate from = of.atDay(1).minusDays(of.atDay(1).getDayOfWeek().getValue() - 1L);
        LocalDate to =
                of.atEndOfMonth().plusDays(7L - of.atEndOfMonth().getDayOfWeek().getValue());
        List<Line> lines = only(lines(circleId, me, from, to), memberId);
        List<MonthDayResponse> days = new ArrayList<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            days.add(new MonthDayResponse(d, YearMonth.from(d).equals(of), dots(lines, d)));
        }
        return new MonthResponse(of.toString(), days);
    }

    /**
     * What Today shows of Plan for one person: every event of the day they may see, and the reminders that
     * are theirs to do or that they asked for: due that day, still open from before, or ticked that day.
     */
    public List<TodayItem> today(UUID circleId, UUID me, LocalDate day) {
        List<TodayItem> items = new ArrayList<>();
        Set<UUID> listed = new LinkedHashSet<>();
        // What is still open from before comes first: it is the one that counts when the same reminder also
        // comes round again today.
        List<Line> lines = new ArrayList<>(overdue(circleId, me, day));
        lines.addAll(lines(circleId, me, day, day));
        for (Line line : lines) {
            // What other places put on the calendar they bring to Today themselves.
            if (line.thing() == null
                    || !line.forMe()
                    || (line.kind() == ThingKind.REMINDER && !listed.add(line.thingId()))) {
                continue;
            }
            items.add(new TodayItem(
                    line.thingId(),
                    line.kind(),
                    line.title(),
                    line.todayNote(),
                    line.kind() == ThingKind.REMINDER ? null : line.lead(),
                    line.done(),
                    line.minute(),
                    line.avatars().stream().limit(2).toList(),
                    line.canTick(),
                    line.dueOn(),
                    line.action(),
                    line.repeats()));
        }
        return items;
    }

    // ---------- every line of a stretch of days ----------

    /** Everything on the days from {@code from} to {@code to} that the viewer may see, each day in order of time. */
    List<Line> lines(UUID circleId, UUID me, LocalDate from, LocalDate to) {
        Map<UUID, Person> circle = people.in(circleId);
        UUID mine = circle.values().stream()
                .filter(p -> me.equals(p.userId()))
                .map(Person::id)
                .findFirst()
                .orElse(null);
        List<Line> lines = new ArrayList<>();
        eventLines(lines, circleId, me, from, to, circle);
        reminderLines(lines, circleId, me, mine, from, to, circle);
        for (PlanSource source : sources) {
            for (Dated dated : source.between(me, circleId, from, to)) {
                if (!dated.day().isBefore(from) && !dated.day().isAfter(to)) {
                    lines.add(brought(dated, circle));
                }
            }
        }
        lines.sort(
                Comparator.comparing(Line::day).thenComparingInt(Line::minute).thenComparing(Line::title));
        return lines;
    }

    private void eventLines(
            List<Line> lines, UUID circleId, UUID me, LocalDate from, LocalDate to, Map<UUID, Person> circle) {
        List<Event> found = events.between(circleId, me, from, to);
        Map<UUID, List<GuestRow>> guests = events
                .guests(found.stream().map(e -> e.thing().id()).toList())
                .stream()
                .collect(Collectors.groupingBy(GuestRow::eventId));
        Set<UUID> persons = circle.values().stream()
                .filter(p -> p.kind() != MemberKind.PET)
                .map(Person::id)
                .collect(Collectors.toSet());
        for (Event event : found) {
            EventRow e = event.detail();
            List<GuestRow> coming = guests.getOrDefault(e.id(), List.of());
            List<GuestRow> members =
                    coming.stream().filter(g -> g.memberId() != null).toList();
            String parts = coming.stream()
                    .filter(g -> !g.part().isEmpty())
                    .map(g -> app.homeport.api.common.Names.first(g.name()) + " " + g.part())
                    .collect(Collectors.joining(" · "));
            boolean everyone = members.size() >= 3
                    && members.stream()
                            .map(GuestRow::memberId)
                            .collect(Collectors.toSet())
                            .containsAll(persons);
            String firstNote = e.notes().lines().findFirst().orElse("");
            String note;
            NoteIcon icon;
            if (e.repeat() != null) {
                note = Words.dots(e.repeat().label(), parts);
                icon = NoteIcon.REPEAT;
            } else if (!e.placeWords().isEmpty()) {
                note = e.placeWords();
                icon = NoteIcon.PIN;
            } else if (e.remindMinutes() != null) {
                note = "Reminds you " + Words.beforeSpoken(e.remindMinutes());
                icon = NoteIcon.BELL;
            } else {
                note = Words.dots(everyone ? "Everyone" : null, parts, firstNote);
                icon = NoteIcon.NONE;
            }
            String todayNote = !parts.isEmpty()
                    ? parts
                    : !e.placeWords().isEmpty()
                            ? e.placeWords()
                            : e.repeat() != null ? e.repeat().label() : firstNote;
            WhoseResponse whose = members.isEmpty()
                    ? whose(circle, event.thing().ownerId())
                    : members.size() >= 3 ? null : whose(circle, members.get(0).memberId());
            List<UUID> concerns = members.isEmpty()
                    ? List.of(event.thing().ownerId())
                    : members.stream().map(GuestRow::memberId).toList();
            List<String> avatars = members.stream()
                    .map(g -> media.urlFor(g.avatarKey(), app.homeport.api.media.MediaSize.SMALL))
                    .filter(Objects::nonNull)
                    .limit(3)
                    .toList();
            long span = ChronoUnit.DAYS.between(e.startsOn(), e.endsOn());
            List<LocalDate> starts = e.repeat() == null
                    ? List.of(e.startsOn())
                    : e.repeat().between(e.startsOn(), from.minusDays(span), to);
            for (LocalDate start : starts) {
                for (long offset = 0; offset <= span; offset++) {
                    LocalDate day = start.plusDays(offset);
                    if (day.isBefore(from) || day.isAfter(to)) {
                        continue;
                    }
                    boolean firstDay = offset == 0;
                    boolean timed = firstDay && !e.allDay();
                    String lead = timed
                            ? Words.time(e.startTime())
                            : !e.allDay() && offset == span && e.endTime() != null
                                    ? "Until " + Words.time(e.endTime())
                                    : "All day";
                    lines.add(new Line(
                            event.thing(),
                            e.id(),
                            ThingKind.EVENT,
                            event.thing().title(),
                            day,
                            lead,
                            timed && span == 0 && e.endTime() != null ? Words.time(e.endTime()) : null,
                            null,
                            false,
                            note,
                            icon,
                            todayNote,
                            whose,
                            concerns,
                            avatars,
                            timed ? minutes(e.startTime()) : 0,
                            true,
                            null,
                            null,
                            e.repeat() != null));
                }
            }
        }
    }

    private void reminderLines(
            List<Line> lines,
            UUID circleId,
            UUID me,
            UUID mine,
            LocalDate from,
            LocalDate to,
            Map<UUID, Person> circle) {
        List<Reminder> current = reminders.current(circleId, me).stream()
                .filter(r -> r.detail().doneAt() == null && r.detail().dueOn() != null)
                .filter(r -> !r.detail().dueOn().isAfter(to))
                .toList();
        Map<UUID, List<UUID>> givenTo =
                reminders.people(current.stream().map(r -> r.thing().id()).toList());
        for (Reminder reminder : current) {
            ReminderRow r = reminder.detail();
            List<UUID> given = givenTo.getOrDefault(r.id(), List.of());
            // The day it is due, then each time it will come round after that: 0 ticks away, 1 tick away, …
            List<LocalDate> days = new ArrayList<>();
            days.add(r.dueOn());
            if (r.repeat() != null) {
                days.addAll(r.repeat().between(r.dueOn(), r.dueOn().plusDays(1), to));
            }
            for (int ticksAway = 0; ticksAway < days.size(); ticksAway++) {
                LocalDate day = days.get(ticksAway);
                if (!day.isBefore(from)) {
                    lines.add(open(reminder, given, day, ticksAway, mine, circle));
                }
            }
        }
        List<Ticked> ticks = reminders.ticked(circleId, me, from, to);
        List<UUID> tickedIds =
                ticks.stream().map(t -> t.detail().id()).distinct().toList();
        // Only a reminder's last tick can be taken away, by whoever could have made it.
        Set<UUID> lastTicks = reminders.lastTicks(tickedIds);
        Map<UUID, List<UUID>> tickedFor = reminders.people(tickedIds);
        for (Ticked ticked : ticks) {
            ReminderRow r = ticked.detail();
            LocalDate due = ticked.tick().dueOn();
            LocalDate day = due != null && !due.isBefore(from) && !due.isAfter(to)
                    ? due
                    : ticked.tick()
                            .doneAt()
                            .atZone(PlanSql.storedZone(r.timeZone()))
                            .toLocalDate();
            UUID did = ticked.tick().doneFor() != null
                    ? ticked.tick().doneFor()
                    : ticked.tick().doneBy();
            String doneNote = Words.dots(
                    "Done at "
                            + Words.time(ticked.tick()
                                    .doneAt()
                                    .atZone(PlanSql.storedZone(r.timeZone()))
                                    .toLocalTime()),
                    ticked.tick().stars() > 0 ? Words.count(ticked.tick().stars(), "star") : null);
            Person who = did == null ? null : circle.get(did);
            boolean forMe = ticked.thing().mine()
                    || (mine != null
                            && (mine.equals(ticked.tick().doneFor())
                                    || mine.equals(ticked.tick().doneBy())));
            lines.add(new Line(
                    ticked.thing(),
                    r.id(),
                    ThingKind.REMINDER,
                    ticked.thing().title(),
                    day,
                    r.dueTime() == null ? null : Words.time(r.dueTime()),
                    null,
                    true,
                    lastTicks.contains(ticked.tick().id())
                            && (ticked.thing().canEdit()
                                    || (mine != null
                                            && tickedFor
                                                    .getOrDefault(r.id(), List.of())
                                                    .contains(mine))),
                    doneNote,
                    NoteIcon.NONE,
                    Words.dots(who == null || did.equals(mine) ? null : who.name(), doneNote),
                    who == null ? null : new WhoseResponse(who.id(), who.name(), who.tint()),
                    did == null ? List.of() : List.of(did),
                    who == null || did.equals(mine) || who.avatarUrl() == null ? List.of() : List.of(who.avatarUrl()),
                    r.dueTime() == null ? 1440 : minutes(r.dueTime()),
                    forMe,
                    ticked.tick().dueOn(),
                    null,
                    r.repeat() != null));
        }
    }

    /** A reminder that is still to do, on the day it is due or a day it will come round on. */
    private Line open(
            Reminder reminder, List<UUID> given, LocalDate day, int ticksAway, UUID mine, Map<UUID, Person> circle) {
        ThingRow thing = reminder.thing();
        ReminderRow r = reminder.detail();
        UUID turn = r.takesTurns() ? Turns.after(r.turnMemberId(), given, ticksAway) : null;
        UUID then = r.takesTurns() ? Turns.after(r.turnMemberId(), given, ticksAway + 1) : null;
        List<UUID> holders = turn != null ? List.of(turn) : given.isEmpty() ? List.of(thing.ownerId()) : given;
        boolean yours = mine != null && holders.contains(mine);
        String names = Words.list(holders.stream()
                .map(circle::get)
                .filter(Objects::nonNull)
                .map(Person::name)
                .toList());
        String who;
        if (turn != null) {
            who = (turn.equals(mine) ? "your turn" : name(circle, turn) + "'s turn")
                    + (then == null ? "" : ", then " + (then.equals(mine) ? "you" : name(circle, then)));
        } else {
            who = yours || names.isEmpty() ? null : "for " + names;
        }
        return new Line(
                thing,
                r.id(),
                ThingKind.REMINDER,
                thing.title(),
                day,
                r.dueTime() == null ? null : Words.time(r.dueTime()),
                null,
                false,
                ticksAway == 0 && (thing.canEdit() || (mine != null && given.contains(mine))),
                Words.dots(r.repeat() == null ? null : r.repeat().label(), who),
                r.repeat() == null ? NoteIcon.NONE : NoteIcon.REPEAT,
                Words.dots(Words.partOfDay(r.dueTime()), turn != null && yours ? "your turn" : yours ? null : names),
                holders.size() >= 3 ? null : whose(circle, holders.get(0)),
                holders,
                yours
                        ? List.of()
                        : holders.stream()
                                .map(circle::get)
                                .filter(Objects::nonNull)
                                .map(Person::avatarUrl)
                                .filter(Objects::nonNull)
                                .limit(3)
                                .toList(),
                r.dueTime() == null ? 1440 : minutes(r.dueTime()),
                yours || thing.mine(),
                day,
                null,
                r.repeat() != null);
    }

    /**
     * The reminders that were due before a day and are still open, each on the day it was due, soonest first.
     * For Today their note says since when: "Since Monday · your turn".
     */
    private List<Line> overdue(UUID circleId, UUID me, LocalDate day) {
        Map<UUID, Person> circle = people.in(circleId);
        UUID mine = circle.values().stream()
                .filter(p -> me.equals(p.userId()))
                .map(Person::id)
                .findFirst()
                .orElse(null);
        List<Reminder> late = reminders.current(circleId, me).stream()
                .filter(r -> r.detail().doneAt() == null && r.detail().dueOn() != null)
                .filter(r -> r.detail().dueOn().isBefore(day))
                .toList();
        Map<UUID, List<UUID>> givenTo =
                reminders.people(late.stream().map(r -> r.thing().id()).toList());
        List<Line> lines = new ArrayList<>();
        for (Reminder reminder : late) {
            LocalDate dueOn = reminder.detail().dueOn();
            Line line = open(reminder, givenTo.getOrDefault(reminder.thing().id(), List.of()), dueOn, 0, mine, circle);
            // The part of the day ("Tonight") was for the day it was due; what matters now is since when.
            String who = line.todayNote().contains(" · ")
                    ? line.todayNote().substring(line.todayNote().indexOf(" · ") + 3)
                    : null;
            lines.add(new Line(
                    line.thing(),
                    line.thingId(),
                    line.kind(),
                    line.title(),
                    dueOn,
                    line.lead(),
                    null,
                    false,
                    line.canTick(),
                    line.note(),
                    line.icon(),
                    Words.dots("Since " + Words.weekdayNear(dueOn, day), who),
                    line.whose(),
                    line.concerns(),
                    line.avatars(),
                    line.minute(),
                    line.forMe(),
                    line.dueOn(),
                    line.action(),
                    line.repeats()));
        }
        return lines;
    }

    /** A line another place brought. */
    private static Line brought(Dated dated, Map<UUID, Person> circle) {
        TodayItem item = dated.item();
        List<UUID> whoseItIs = dated.memberIds() == null ? List.of() : dated.memberIds();
        return new Line(
                null,
                item.thingId(),
                item.kind(),
                item.title(),
                dated.day(),
                item.lead(),
                null,
                item.done(),
                false,
                item.note(),
                NoteIcon.NONE,
                item.note(),
                whoseItIs.isEmpty() || whoseItIs.size() >= 3 ? null : whose(circle, whoseItIs.get(0)),
                whoseItIs,
                item.avatarUrls() == null ? List.of() : item.avatarUrls(),
                item.minute(),
                true,
                item.dueOn(),
                item.action(),
                item.repeats());
    }

    // ---------- small pieces ----------

    /** Only the lines that concern one person, when one is asked for. */
    private static List<Line> only(List<Line> lines, UUID memberId) {
        return memberId == null
                ? lines
                : lines.stream()
                        .filter(line -> line.concerns().contains(memberId))
                        .toList();
    }

    /** One dot per person who has something on a day, in the order of the day; one for what is everyone's. */
    private static List<DotResponse> dots(List<Line> lines, LocalDate day) {
        Map<String, DotResponse> dots = new LinkedHashMap<>();
        for (Line line : lines) {
            if (line.day().equals(day)) {
                DotResponse dot = line.whose() == null
                        ? new DotResponse(null, 0)
                        : new DotResponse(line.whose().memberId(), line.whose().tint());
                dots.putIfAbsent(String.valueOf(dot.memberId()), dot);
            }
        }
        return List.copyOf(dots.values());
    }

    private Map<UUID, AudienceChip> chips(List<Line> lines) {
        Map<UUID, ThingRow> rows = new LinkedHashMap<>();
        for (Line line : lines) {
            if (line.thing() != null) {
                rows.putIfAbsent(line.thing().id(), line.thing());
            }
        }
        return things.chips(List.copyOf(rows.values()));
    }

    private static PlanEntryResponse entry(Line line, Map<UUID, AudienceChip> chips) {
        return new PlanEntryResponse(
                line.thingId(),
                line.kind(),
                line.title(),
                line.day(),
                line.lead(),
                line.leadEnd(),
                line.done(),
                line.canTick(),
                line.dueOn(),
                line.note(),
                line.icon(),
                line.action(),
                line.repeats(),
                line.whose(),
                line.avatars(),
                line.minute(),
                line.thing() != null && line.thing().mine(),
                line.thing() != null && line.thing().canEdit(),
                line.thing() == null ? null : chips.get(line.thing().id()));
    }

    private static WhoseResponse whose(Map<UUID, Person> circle, UUID memberId) {
        Person person = circle.get(memberId);
        return person == null ? null : new WhoseResponse(person.id(), person.name(), person.tint());
    }

    private static String name(Map<UUID, Person> circle, UUID memberId) {
        Person person = circle.get(memberId);
        return person == null ? "someone" : person.name();
    }

    private static int minutes(LocalTime time) {
        return time.getHour() * 60 + time.getMinute();
    }
}
