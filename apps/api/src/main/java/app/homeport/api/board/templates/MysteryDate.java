package app.homeport.api.board.templates;

import app.homeport.api.board.BoardRules;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Person;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.board.Words;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.home.TodaySource.TodayCard;
import app.homeport.api.money.Cash;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.stereotype.Component;

/**
 * Mystery date: one plans, the other knows a day, a time and a hint, and clues that open one at a time.
 *
 * <p><b>Who sees what.</b> It is decided in {@link #sight} and {@link #clueOpen}, and only there:
 *
 * <ul>
 *   <li>Whoever plans a date sees all of it: what it is, the lines of the plan, every clue with its time.
 *   <li>Everyone else who sees the board gets the envelope: the day, the time, the hint, and who is planning.
 *       What it is and the plan's lines don't leave the API. A clue leaves the API when its moment has come,
 *       and not before; of the clues still to come they are told how many, nothing else. By its id a line or
 *       a clue that isn't open "isn't there".
 *   <li>A date is revealed when its moment comes (they are there), or earlier when the planner says so. From
 *       then on everyone who sees the board sees all of it, and it joins the list of dates there have been.
 * </ul>
 *
 * A clue opens by the API's clock, not the phone's: a phone set to Saturday reads nothing early.
 *
 * <p>The turn to plan goes round: the next one is whoever comes after the planner of the last date. It is a
 * reminder, not a lock. "Shake the jar" pulls an idea from the ideas kept on this board; the drawing's date
 * jar ("Date ideas") is a template of its own that isn't built yet.
 */
@Component
class MysteryDate implements BoardRules {

    static final String DATE = "date";
    static final String LINE = "line";
    static final String CLUE = "clue";
    static final String IDEA = "idea";
    private static final int MAX_PARTS = 30;

    record MysteryDateSettings() {}

    /**
     * A date. The entry's columns hold the rest: {@code author_id} plans it, {@code day} is its day,
     * {@code opens_at} the moment it starts, {@code done_at} when it was revealed.
     *
     * @param title what it is: the secret
     * @param time the time as the planner's clock says it: 20:00
     * @param suggestionId the idea the jar gave last
     */
    record Plan(String title, String time, String hint, UUID suggestionId) {}

    /** @param icon a word the app has a picture for: pin, euro, users */
    record PlanLine(String icon, String title, String note, Boolean ready, Long cents) {}

    /** A clue. The entry's {@code opens_at} is the moment it opens; none means at once. */
    record Clue(String text) {}

    record Idea(String text) {}

    /** What one person may know of one date. */
    enum Sight {
        /** They plan it: everything. */
        PLANNER,
        /** It has been revealed: everything. */
        OPEN,
        /** The envelope: day, time, hint, and the clues whose moment has come. */
        ENVELOPE
    }

    record MysteryDateResponse(
            @Schema(nullable = true, description = "The date that is coming. Null when none is planned.")
            MysteryDateDateResponse next,

            @Schema(nullable = true, description = "Whose turn it is to plan the one after")
            PersonBrief turn,

            boolean yourTurn,

            @Schema(description = "How many dates there are in this calendar year, the coming one included")
            int thisYear,

            @Schema(
                    description =
                            "The last five dates there have been, newest first. The list of entries has them all.")
            List<MysteryDatePastResponse> past,

            @Schema(description = "How many ideas are in this board's jar")
            int ideas) {}

    record MysteryDateDateResponse(
            UUID id,
            LocalDate day,

            @Schema(nullable = true, description = "The time, as the planner's clock says it: 20:00")
            String time,

            @Schema(nullable = true, description = "The moment it starts, and is revealed")
            Instant at,

            @Schema(nullable = true) PersonBrief planner,

            @Schema(description = "True when the person looking plans it")
            boolean yours,

            @Schema(nullable = true, description = "All the other one gets besides the time: Wear something warm.")
            String hint,

            boolean revealed,

            @Schema(
                    nullable = true,
                    description = "What it is. Null for everyone but the planner until it is revealed.")
            String title,

            @Schema(description = "The plan. Empty for everyone but the planner until it is revealed.")
            List<MysteryDateLineResponse> plan,

            @Schema(description = "The clues. For everyone but the planner: only those whose moment has come.")
            List<MysteryDateClueResponse> clues,

            @Schema(description = "How many clues are still to open")
            int cluesToCome,

            @Schema(nullable = true, description = "For the planner: the idea the jar gave last")
            String suggestion) {}

    record MysteryDateLineResponse(
            UUID id,

            @Schema(nullable = true, description = "A word the app has a picture for: pin, euro, users")
            String icon,

            String title,
            @Schema(nullable = true) String note,

            @Schema(description = "True for a line that is sorted: the tick")
            boolean ready,

            @Schema(nullable = true, description = "What it costs, in cents")
            Long cents) {}

    record MysteryDateClueResponse(
            UUID id,
            String text,

            @Schema(nullable = true, description = "The moment it opens. Null: it was open from the start.")
            Instant opensAt,

            boolean open) {}

    record MysteryDatePastResponse(
            UUID id,
            @Schema(nullable = true) String title,
            @Schema(nullable = true) PersonBrief planner,

            @Schema(description = "True when the person looking planned it")
            boolean yours,

            LocalDate day) {}

    @Override
    public Template template() {
        return Template.MYSTERY_DATE;
    }

    @Override
    public Class<?> settingsType() {
        return MysteryDateSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return MysteryDateResponse.class;
    }

    @Override
    public Class<?> entryType() {
        return MysteryDatePastResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: none",
                "entry date: day (a date), time (as the clock says it: 20:00), at (the moment it starts, as"
                        + " 2026-11-13T19:00:00Z; left out: that day and time read as UTC), hint, title (what it"
                        + " is: only you see it until it is revealed). One date is planned at a time.",
                "entry line: dateId, title, note, icon (pin, euro, users), ready (true or false), cents. Only the"
                        + " planner sees the plan's lines until the date is revealed.",
                "entry clue: dateId, text, opensAt (the moment it opens; left out: at once)",
                "entry idea: text (an idea for the jar; everyone sees the jar)",
                "verb reveal: entryId (your own date: show all of it now)",
                "verb shake: pulls an idea from the jar for the date you are planning. It is in `suggestion`.");
    }

    @Override
    public boolean viewersMayWrite(String kind) {
        return kind.equals(IDEA);
    }

    // ---------- who sees what ----------

    private static boolean revealed(EntryRow date, Instant now) {
        return date.done() || (date.opensAt() != null && !date.opensAt().isAfter(now));
    }

    /** The one place that decides what a person may know of a date, and of everything under it. */
    private static Sight sight(Scene scene, EntryRow date) {
        if (scene.isMe(date.authorId())) {
            return Sight.PLANNER;
        }
        return revealed(date, scene.now()) ? Sight.OPEN : Sight.ENVELOPE;
    }

    /** True when a clue has left its envelope: it had no moment, or its moment has come. */
    private static boolean clueOpen(Scene scene, EntryRow clue) {
        return clue.opensAt() == null || !clue.opensAt().isAfter(scene.now());
    }

    /** The date a line or a clue belongs to. */
    private static EntryRow dateOf(Scene scene, EntryRow part) {
        return scene.entries(DATE).stream()
                .filter(date -> date.id().equals(part.parentId()))
                .findFirst()
                .orElseThrow(Scene::entryGone);
    }

    /** True when this person may read a line or a clue. */
    private static boolean reads(Scene scene, EntryRow part) {
        Sight sight = sight(scene, dateOf(scene, part));
        return sight != Sight.ENVELOPE || (part.is(CLUE) && clueOpen(scene, part));
    }

    // ---------- settings ----------

    @Override
    public Object settings(Scene scene, Fields sent) {
        return new MysteryDateSettings();
    }

    // ---------- what a person sees ----------

    private static List<EntryRow> byDay(Scene scene) {
        return scene.entries(DATE).stream()
                .sorted(Comparator.comparing(EntryRow::day).thenComparing(EntryRow::createdAt))
                .toList();
    }

    /** The date that is coming: the earliest one that hasn't been revealed. */
    private static EntryRow coming(Scene scene) {
        return byDay(scene).stream()
                .filter(date -> !revealed(date, scene.now()))
                .findFirst()
                .orElse(null);
    }

    /** Whose turn it is to plan after the last date there is: the next person round the circle. */
    private static UUID turn(Scene scene) {
        List<UUID> people = scene.humans().stream().map(Person::id).toList();
        List<EntryRow> dates = byDay(scene);
        return dates.isEmpty()
                ? (people.isEmpty() ? null : people.get(0))
                : WhoseTurn.after(people, dates.get(dates.size() - 1).authorId());
    }

    @Override
    public Object view(Scene scene, String show) {
        EntryRow coming = coming(scene);
        UUID turn = turn(scene);
        return new MysteryDateResponse(
                coming == null ? null : date(scene, coming),
                scene.brief(turn),
                scene.isMe(turn),
                (int) scene.entries(DATE).stream()
                        .filter(date -> date.day().getYear() == scene.today().getYear())
                        .count(),
                byDay(scene).reversed().stream()
                        .filter(date -> revealed(date, scene.now()))
                        .limit(5)
                        .map(date -> past(scene, date))
                        .toList(),
                scene.entries(IDEA).size());
    }

    private static MysteryDateDateResponse date(Scene scene, EntryRow row) {
        Plan plan = row.as(Plan.class);
        Sight sight = sight(scene, row);
        boolean all = sight != Sight.ENVELOPE;
        List<EntryRow> clues =
                scene.under(row.id()).stream().filter(part -> part.is(CLUE)).toList();
        return new MysteryDateDateResponse(
                row.id(),
                row.day(),
                plan.time(),
                row.opensAt(),
                scene.brief(row.authorId()),
                sight == Sight.PLANNER,
                plan.hint(),
                revealed(row, scene.now()),
                all ? plan.title() : null,
                !all
                        ? List.of()
                        : scene.under(row.id()).stream()
                                .filter(part -> part.is(LINE))
                                .map(MysteryDate::line)
                                .toList(),
                clues.stream()
                        .filter(clue -> all || clueOpen(scene, clue))
                        .map(clue -> new MysteryDateClueResponse(
                                clue.id(), clue.as(Clue.class).text(), clue.opensAt(), clueOpen(scene, clue)))
                        .toList(),
                (int) clues.stream().filter(clue -> !clueOpen(scene, clue)).count(),
                sight == Sight.PLANNER && plan.suggestionId() != null
                        ? scene.entries(IDEA).stream()
                                .filter(idea -> idea.id().equals(plan.suggestionId()))
                                .map(idea -> idea.as(Idea.class).text())
                                .findFirst()
                                .orElse(null)
                        : null);
    }

    private static MysteryDateLineResponse line(EntryRow row) {
        PlanLine line = row.as(PlanLine.class);
        return new MysteryDateLineResponse(
                row.id(), line.icon(), line.title(), line.note(), Boolean.TRUE.equals(line.ready()), line.cents());
    }

    private static MysteryDatePastResponse past(Scene scene, EntryRow row) {
        return new MysteryDatePastResponse(
                row.id(),
                row.as(Plan.class).title(),
                scene.brief(row.authorId()),
                scene.isMe(row.authorId()),
                row.day());
    }

    /** The list of entries is the dates there have been. Nothing that is still hidden is in it. */
    @Override
    public Object entry(Scene scene, EntryRow entry) {
        return entry.is(DATE) && revealed(entry, scene.now()) ? past(scene, entry) : null;
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        return switch (entry.kind()) {
            case DATE -> {
                Plan plan = entry.as(Plan.class);
                yield sight(scene, entry) == Sight.ENVELOPE
                        ? plan.hint()
                        : Objects.requireNonNullElse(plan.title(), "")
                                + (plan.hint() == null ? "" : " · " + plan.hint());
            }
            case LINE -> {
                PlanLine line = entry.as(PlanLine.class);
                yield reads(scene, entry) ? line.title() + (line.note() == null ? "" : " · " + line.note()) : null;
            }
            case CLUE -> reads(scene, entry) ? entry.as(Clue.class).text() : null;
            case IDEA -> entry.as(Idea.class).text();
            default -> null;
        };
    }

    // ---------- changing it ----------

    /** A time as the clock says it, or null. "20:00", "7:30". */
    private static String time(String sent) {
        if (sent == null) {
            return null;
        }
        try {
            return LocalTime.parse(sent.length() == 4 ? "0" + sent : sent).toString();
        } catch (RuntimeException notATime) {
            throw ApiProblem.badRequest("invalid_time", "Write the time like 20:00.");
        }
    }

    private static EntryDraft planned(
            Scene scene, EntryDraft draft, Fields sent, Plan now, LocalDate dayNow, Instant atNow) {
        LocalDate day = sent.day("day", dayNow);
        if (day == null || (!day.equals(dayNow) && day.isBefore(scene.today()))) {
            throw ApiProblem.badRequest("invalid_day", "Choose the day. It has to be today or later.");
        }
        String time = sent.has("time") ? time(sent.text("time", 5)) : now.time();
        Instant at = Phrases.instant(sent.text("at", 40));
        if (at == null && atNow != null && !sent.has("day") && !sent.has("time")) {
            at = atNow; // only the words changed: the moment stays
        }
        if (at == null) {
            // No moment from the phone: the day and the time read as UTC, the end of the day when there is no time.
            at = day.atTime(time == null ? LocalTime.of(23, 59) : LocalTime.parse(time))
                    .toInstant(ZoneOffset.UTC);
        }
        return draft.day(day)
                .opensAt(at)
                .doc(new Plan(
                        sent.text("title", 200, now.title()),
                        time,
                        sent.text("hint", 200, now.hint()),
                        now.suggestionId()));
    }

    /** The date a part is added to, for its planner. To anyone else it can't be added to. */
    private static EntryRow mine(Scene scene, UUID dateId) {
        EntryRow date = scene.need(dateId);
        if (!date.is(DATE)) {
            throw Scene.entryGone();
        }
        if (!scene.isMe(date.authorId())) {
            throw BoardRules.notYours();
        }
        if (scene.under(date.id()).size() >= MAX_PARTS) {
            throw ApiProblem.conflict("too_many", "That's a lot for one evening. Thirty lines and clues is the most.");
        }
        return date;
    }

    private static PlanLine line(Fields sent, PlanLine now) {
        String title = sent.text("title", 200, now.title());
        if (title == null) {
            throw ApiProblem.badRequest("missing_title", "Write the line first.");
        }
        return new PlanLine(
                sent.text("icon", 20, now.icon()),
                title,
                sent.text("note", 200, now.note()),
                sent.flag("ready", Boolean.TRUE.equals(now.ready())),
                sent.whole("cents", 0, Cash.MAX_CENTS, now.cents()));
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        return switch (kind) {
            case DATE -> {
                if (coming(scene) != null) {
                    throw ApiProblem.conflict("one_at_a_time", "There is a date being planned already.");
                }
                yield scene.add(
                        planned(
                                scene,
                                EntryDraft.of(DATE).by(scene.myId()),
                                sent,
                                new Plan(null, null, null, null),
                                null,
                                null),
                        clientId);
            }
            case LINE ->
                scene.add(
                        EntryDraft.of(LINE)
                                .under(mine(scene, sent.id("dateId")).id())
                                .by(scene.myId())
                                .doc(line(sent, new PlanLine(null, null, null, null, null))),
                        clientId);
            case CLUE ->
                scene.add(
                        EntryDraft.of(CLUE)
                                .under(mine(scene, sent.id("dateId")).id())
                                .by(scene.myId())
                                .opensAt(Phrases.instant(sent.text("opensAt", 40)))
                                .doc(new Clue(sent.need("text", 300, "Write the clue first."))),
                        clientId);
            case IDEA ->
                scene.add(
                        EntryDraft.of(IDEA)
                                .by(scene.myId())
                                .doc(new Idea(sent.need("text", 200, "Write the idea first."))),
                        clientId);
            default -> throw BoardRules.unknownKind();
        };
    }

    /** The planner of the date an entry is, or belongs to. To anyone who may not read the entry it isn't there. */
    private static void planner(Scene scene, EntryRow entry) {
        EntryRow date = entry.is(DATE) ? entry : dateOf(scene, entry);
        if (!entry.is(DATE) && !reads(scene, entry)) {
            throw Scene.entryGone();
        }
        if (!scene.isMe(date.authorId())) {
            throw BoardRules.notYours();
        }
    }

    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        switch (entry.kind()) {
            case DATE -> {
                planner(scene, entry);
                scene.save(
                        entry,
                        planned(
                                scene,
                                EntryDraft.from(entry),
                                sent,
                                entry.as(Plan.class),
                                entry.day(),
                                entry.opensAt()));
            }
            case LINE -> {
                planner(scene, entry);
                scene.save(entry, EntryDraft.from(entry).doc(line(sent, entry.as(PlanLine.class))));
            }
            case CLUE -> {
                planner(scene, entry);
                EntryDraft draft =
                        EntryDraft.from(entry).doc(new Clue(sent.need("text", 300, "Write the clue first.")));
                if (sent.has("opensAt")) {
                    draft.opensAt(Phrases.instant(sent.text("opensAt", 40)));
                }
                scene.save(entry, draft);
            }
            case IDEA -> idea(scene, entry, sent.need("text", 200, "Write the idea first."));
            default -> throw BoardRules.unknownKind();
        }
    }

    private static void idea(Scene scene, EntryRow entry, String text) {
        if (!scene.isMe(entry.authorId()) && !scene.canEdit()) {
            throw BoardRules.notYours();
        }
        if (text == null) {
            scene.remove(entry.id());
        } else {
            scene.save(entry, EntryDraft.from(entry).doc(new Idea(text)));
        }
    }

    @Override
    public void remove(Scene scene, EntryRow entry) {
        if (entry.is(IDEA)) {
            idea(scene, entry, null);
            return;
        }
        planner(scene, entry);
        scene.remove(entry.id());
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        switch (verb) {
            case "reveal" -> {
                EntryRow date = scene.need(sent.id("entryId"));
                if (!date.is(DATE)) {
                    throw Scene.entryGone();
                }
                planner(scene, date);
                if (!date.done()) {
                    scene.save(date, EntryDraft.from(date).done(scene.now(), scene.myId()));
                }
            }
            case "shake" -> {
                EntryRow date = coming(scene);
                if (date == null || !scene.isMe(date.authorId())) {
                    throw ApiProblem.conflict("no_date_of_yours", "Start the date first: give it a day.");
                }
                Plan plan = date.as(Plan.class);
                List<EntryRow> ideas = scene.entries(IDEA);
                List<EntryRow> others = ideas.stream()
                        .filter(idea -> !idea.id().equals(plan.suggestionId()))
                        .toList();
                List<EntryRow> from = others.isEmpty() ? ideas : others;
                if (from.isEmpty()) {
                    throw ApiProblem.conflict("jar_empty", "The jar is empty. Put an idea in first.");
                }
                UUID pulled = from.get(ThreadLocalRandom.current().nextInt(from.size()))
                        .id();
                scene.save(date, EntryDraft.from(date).doc(new Plan(plan.title(), plan.time(), plan.hint(), pulled)));
            }
            default -> throw BoardRules.unknownVerb();
        }
    }

    // ---------- what it brings to the rest ----------

    /** Never says what it is. */
    @Override
    public String glance(Scene scene) {
        EntryRow coming = coming(scene);
        if (coming == null) {
            return Words.count(scene.entries(DATE).size(), "date") + " so far";
        }
        return Words.weekday(coming.day()) + " " + Words.shortDay(coming.day()) + " · "
                + (scene.isMe(coming.authorId())
                        ? "your turn to plan"
                        : scene.firstName(coming.authorId()) + " is planning");
    }

    /** In the two weeks before the date: whose it is to plan, and what the other one knows. */
    @Override
    public List<TodayCard> cards(Scene scene) {
        EntryRow coming = coming(scene);
        if (coming == null
                || scene.me() == null
                || ChronoUnit.DAYS.between(scene.today(), coming.day()) > 14
                || coming.day().isBefore(scene.today())) {
            return List.of();
        }
        Plan plan = coming.as(Plan.class);
        String when = Phrases.coming(coming.day(), scene.today());
        if (scene.isMe(coming.authorId())) {
            String others = Phrases.list(scene.humans().stream()
                    .filter(person -> !scene.isMe(person.id()))
                    .map(person -> scene.firstName(person.id()))
                    .toList());
            String known = plan.time() == null
                    ? (plan.hint() == null ? null : Phrases.inSentence(plan.hint()))
                    : plan.time() + (plan.hint() == null ? "" : ", " + Phrases.inSentence(plan.hint()));
            return List.of(Phrases.card(
                    scene,
                    when + " is yours to plan",
                    known == null
                            ? "All " + others + " knows is the day."
                            : "All " + others + " knows: “" + known + "”",
                    null,
                    null,
                    null,
                    10));
        }
        String known = plan.time() == null
                ? Objects.requireNonNullElse(plan.hint(), "That is all you get.")
                : plan.time() + "." + (plan.hint() == null ? "" : " " + plan.hint());
        return List.of(Phrases.card(
                scene,
                when + ": a mystery date",
                scene.firstName(coming.authorId()) + " is planning. " + known,
                null,
                null,
                null,
                10));
    }
}
