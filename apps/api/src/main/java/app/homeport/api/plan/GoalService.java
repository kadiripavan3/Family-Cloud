package app.homeport.api.plan;

import app.homeport.api.circle.MemberKind;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Keyset;
import app.homeport.api.common.Page;
import app.homeport.api.list.ChecklistService;
import app.homeport.api.list.ChecklistStore;
import app.homeport.api.list.ChecklistStore.Tally;
import app.homeport.api.media.MediaKind;
import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSize;
import app.homeport.api.plan.GoalNumber.Line;
import app.homeport.api.plan.GoalNumber.Lines;
import app.homeport.api.plan.GoalNumber.Reading;
import app.homeport.api.plan.GoalStore.EntryRow;
import app.homeport.api.plan.GoalStore.Goal;
import app.homeport.api.plan.GoalStore.GoalRow;
import app.homeport.api.plan.PlanPeople.Person;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.AudienceChip;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.LongFunction;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Goals: a name, a target, and how far it has got. How far is one of three things:
 *
 * <ul>
 *   <li>a number: the sum of what people put in ("Alex added €150"), each with who and when;
 *   <li>ticks: how many lines of its list of steps are ticked. The steps are an ordinary checklist linked to
 *       the goal, so they are ticked, shared and worked on like any other list;
 *   <li>a number read from elsewhere (a cell of a sheet, the days of a Journey challenge) through
 *       {@link GoalNumber}. While nothing can read that place, or the viewer may not see it, the goal shows
 *       what was put in by hand. Such a goal keeps no second count of its own: where the number is a sum of
 *       lines (the rows "Saved" adds up), those rows are the goal's lines, "Add money" writes a row there
 *       and taking a line back removes it; where it is anything else, adding is refused in plain words and
 *       {@code addHere} is false.
 * </ul>
 *
 * The ring, what is left and the sentence about the pace are worked out by {@link GoalPace}.
 */
@Service
public class GoalService {

    static final int RECENT = 3;

    public record EntryResponse(
            UUID id,
            @Schema(nullable = true) PersonBrief by,

            @Schema(description = "In the goal's unit: cents for money. Below zero when something was taken out.")
            long amount,

            @Schema(description = "Alex added €150") String line,
            String note,

            @Schema(nullable = true, description = "Null only for a line read from a sheet whose row has no day")
            LocalDate day) {}

    /** Where a goal reads its number from, when it isn't put in by hand. */
    public record SourceResponse(
            GoalSource kind,
            String ref,

            @Schema(description = "Reads “Saved” in Norway budget")
            String line,

            @Schema(description = "False while that place can't be read: the goal then shows what was put in by hand")
            boolean live,

            @Schema(
                    nullable = true,
                    description = "The thing the number is read from, to open from the row: the sheet. Null when"
                            + " you can't see it, and when it is no thing here (a challenge in Journey).")
            UUID thingId,

            @Schema(nullable = true) ThingKind thingKind) {}

    /** The goal's list of steps: an ordinary checklist, read and ticked through the checklist routes. */
    public record StepsResponse(UUID listId, String title, int left, int done) {}

    /** A goal in the list of goals: its ring and its line. */
    public record GoalRowResponse(
            UUID id,
            UUID circleId,
            String title,
            String emoji,
            @Schema(nullable = true) String coverUrl,

            @Schema(description = "How far, 0 to 100: what the ring shows")
            int percent,

            @Schema(description = "The line under the name: €5,600 of €8,000 · on track for March")
            String line,

            boolean reached,

            @Schema(nullable = true, description = "Where it reads its number, when not by hand")
            GoalSource source,

            @Schema(description = "What it counts: money, or a plain number of something")
            GoalUnit unit,

            @Schema(description = "What is counted, when it isn't money: books, stars")
            String unitWords,

            @Schema(description = "Who put something in, whoever began first coming first")
            List<PersonBrief> people,

            @Schema(description = "All four chip in. Empty when nobody has yet.")
            String cheer,

            Instant updatedAt,
            boolean mine,
            boolean canEdit,
            AudienceChip chip) {}

    public record GoalResponse(
            UUID id,
            UUID circleId,
            String title,
            String blurb,
            String emoji,
            @Schema(nullable = true) String coverUrl,
            GoalUnit unit,
            String currency,

            @Schema(description = "What is counted, when it isn't money: books, stars")
            String unitWords,

            @Schema(description = "In the goal's unit: cents for money")
            long target,

            long current,

            @Schema(description = "How far, in words: €5,600")
            String currentLabel,

            @Schema(description = "The target, in words: €8,000")
            String targetLabel,

            HowFar how,
            LocalDate startDay,
            @Schema(nullable = true) LocalDate targetDay,

            @Schema(nullable = true, description = "by March 2027")
            String byLabel,

            @Schema(description = "€5,600 of €8,000") String amountLine,

            @Schema(description = "The line under the name in a list: €5,600 of €8,000 · on track for March")
            String line,

            GoalPace pace,
            List<PersonBrief> people,

            @Schema(description = "All four chip in. Empty when nobody has yet.")
            String cheer,

            @Schema(nullable = true) SourceResponse source,
            @Schema(nullable = true) StepsResponse steps,

            @Schema(description = "The year the twelve months are of")
            int year,

            @Schema(description = "What was put in during each month of that year, January first")
            List<Long> months,

            @Schema(description = "The last few times something was put in")
            List<EntryResponse> recent,

            @Schema(
                    description = "False when Add can't be done on this goal: its number is kept elsewhere and is"
                            + " not a sum of lines you can add to (a formula in a sheet, a sheet you may not change,"
                            + " a challenge in Journey). Offer to open source.thingId instead. True otherwise; for"
                            + " a goal that reads the sum of a sheet's column, what is added becomes a row there.")
            boolean addHere,

            Instant updatedAt,
            boolean mine,
            boolean canEdit,
            AudienceChip chip) {}

    public record Source(GoalSource kind, String ref, String words) {}

    public record NewGoal(
            UUID circleId,
            String title,
            String blurb,
            String emoji,
            UUID coverMediaId,
            GoalUnit unit,
            String currency,
            String unitWords,
            Long target,
            Long current,
            HowFar how,
            LocalDate startDay,
            LocalDate targetDay,
            Source source,
            List<String> steps,
            UUID stepsListId,
            Audience audience) {}

    public record GoalChange(
            String title,
            String blurb,
            String emoji,
            UUID coverMediaId,
            boolean removeCover,
            String unitWords,
            Long target,
            HowFar how,
            LocalDate startDay,
            LocalDate targetDay,
            boolean removeTargetDay,
            Source source,
            boolean removeSource,
            UUID stepsListId) {}

    private final ThingService things;
    private final ThingStore thingStore;
    private final GoalStore goals;
    private final PlanPeople people;
    private final MediaService media;
    private final ChecklistService checklists;
    private final ChecklistStore checklistStore;
    private final Map<GoalSource, GoalNumber> numbers;

    GoalService(
            ThingService things,
            ThingStore thingStore,
            GoalStore goals,
            PlanPeople people,
            MediaService media,
            ChecklistService checklists,
            ChecklistStore checklistStore,
            List<GoalNumber> numbers) {
        this.things = things;
        this.thingStore = thingStore;
        this.goals = goals;
        this.people = people;
        this.media = media;
        this.checklists = checklists;
        this.checklistStore = checklistStore;
        this.numbers = numbers.stream().collect(Collectors.toMap(GoalNumber::source, Function.identity()));
    }

    // ---------- making and changing ----------

    @Transactional
    public GoalResponse create(UUID me, NewGoal input, UUID clientId, LocalDate today) {
        LocalDate day = today == null ? LocalDate.now() : today;
        UUID id = things.create(me, input.circleId(), ThingKind.GOAL, input.title(), input.audience(), clientId);
        if (thingStore.isNew(id, "goals")) {
            ThingRow row = things.require(id, me, ThingKind.GOAL);
            if (input.coverMediaId() != null) {
                media.requireOwn(input.coverMediaId(), me, MediaKind.PHOTO);
            }
            UUID stepsList = input.stepsListId();
            if (stepsList != null) {
                requireList(stepsList, row.circleId(), me);
            } else if (input.steps() != null && !input.steps().isEmpty()) {
                // The steps are a checklist of their own. Its clientId follows from the goal's, so sending the
                // goal twice makes one list too.
                stepsList = checklists
                        .create(
                                me,
                                row.circleId(),
                                row.title(),
                                input.audience(),
                                input.steps(),
                                UUID.nameUUIDFromBytes(("steps:" + clientId).getBytes(StandardCharsets.UTF_8)))
                        .id();
            }
            Source source = input.source();
            HowFar how = input.how() != null ? input.how() : source != null ? HowFar.SOURCE : HowFar.NUMBER;
            GoalRow fresh = checked(new GoalRow(
                    id,
                    clean(input.blurb()),
                    clean(input.emoji()),
                    null,
                    input.unit() == null ? GoalUnit.COUNT : input.unit(),
                    input.currency() == null ? "EUR" : input.currency(),
                    clean(input.unitWords()),
                    input.target() == null ? 1 : input.target(),
                    how,
                    stepsList,
                    source == null ? null : source.kind(),
                    source == null ? null : source.ref(),
                    source == null ? "" : clean(source.words()),
                    input.startDay() == null ? day : input.startDay(),
                    input.targetDay()));
            if (how != HowFar.TICKS && input.target() == null) {
                throw ApiProblem.badRequest("no_target", "Say what the goal is: how much, or how many.");
            }
            goals.insert(id, fresh, input.coverMediaId());
            if (stepsList != null) {
                things.link(id, stepsList, me);
            }
            if (input.current() != null && input.current() != 0) {
                goals.addEntry(id, myMember(row.circleId(), me), input.current(), "", fresh.startsOn(), null);
            }
        }
        return get(id, me, day, null);
    }

    @Transactional
    public GoalResponse change(UUID id, UUID me, GoalChange change, LocalDate today) {
        ThingRow row = things.requireEdit(id, me, ThingKind.GOAL);
        GoalRow g = goals.find(id).orElseThrow(ThingService::notFound);
        if (change.coverMediaId() != null) {
            media.requireOwn(change.coverMediaId(), me, MediaKind.PHOTO);
        }
        if (change.stepsListId() != null && !change.stepsListId().equals(g.stepsListId())) {
            requireList(change.stepsListId(), row.circleId(), me);
            things.link(id, change.stepsListId(), me);
        }
        Source source = change.source();
        GoalRow next = checked(new GoalRow(
                id,
                change.blurb() == null ? g.blurb() : clean(change.blurb()),
                change.emoji() == null ? g.emoji() : clean(change.emoji()),
                null,
                g.unit(),
                g.currency(),
                change.unitWords() == null ? g.unitWords() : clean(change.unitWords()),
                change.target() == null ? g.target() : change.target(),
                change.how() != null
                        ? change.how()
                        : change.removeSource() && g.how() == HowFar.SOURCE ? HowFar.NUMBER : g.how(),
                change.stepsListId() == null ? g.stepsListId() : change.stepsListId(),
                change.removeSource() ? null : source == null ? g.sourceKind() : source.kind(),
                change.removeSource() ? null : source == null ? g.sourceRef() : source.ref(),
                change.removeSource() ? "" : source == null ? g.sourceWords() : clean(source.words()),
                change.startDay() == null ? g.startsOn() : change.startDay(),
                change.removeTargetDay() ? null : change.targetDay() == null ? g.targetOn() : change.targetDay()));
        goals.save(id, next, change.coverMediaId() != null || change.removeCover(), change.coverMediaId());
        thingStore.retitle(
                id, change.title() == null ? row.title() : change.title().trim());
        return get(id, me, today, null);
    }

    /** A goal as it may be kept: what it reads from is named when it reads from elsewhere, and it has steps when it counts ticks. */
    private static GoalRow checked(GoalRow g) {
        if (g.how() == HowFar.SOURCE
                && (g.sourceKind() == null
                        || g.sourceRef() == null
                        || g.sourceRef().isBlank())) {
            throw ApiProblem.badRequest("no_source", "Choose where the goal reads its number from.");
        }
        if (g.how() == HowFar.TICKS && g.stepsListId() == null) {
            throw ApiProblem.badRequest("no_steps", "A goal that counts ticks needs a list of steps.");
        }
        if (g.targetOn() != null && g.targetOn().isBefore(g.startsOn())) {
            throw ApiProblem.badRequest("ends_before_it_starts", "The day to be done by can't be before it began.");
        }
        return g;
    }

    private void requireList(UUID listId, UUID circleId, UUID me) {
        ThingRow list = things.require(listId, me, ThingKind.CHECKLIST);
        if (!list.circleId().equals(circleId)) {
            throw ApiProblem.badRequest("not_in_circle", "Choose a list from this circle.");
        }
    }

    // ---------- putting in ----------

    /** Puts something into a goal, for yourself or for someone of the circle (a child's pocket money). */
    @Transactional
    public EntryResponse addEntry(
            UUID goalId, UUID me, long amount, String note, LocalDate day, UUID forMember, UUID clientId) {
        ThingRow row = things.requireEdit(goalId, me, ThingKind.GOAL);
        GoalRow g = goals.find(goalId).orElseThrow(ThingService::notFound);
        Map<UUID, Person> circle = people.in(row.circleId());
        UUID by = forMember == null ? myMember(circle, me) : forMember;
        PlanPeople.chosen(circle, List.of(by));
        if (circle.get(by).kind() == MemberKind.PET) {
            throw ApiProblem.badRequest("not_a_person", "Choose a person.");
        }
        if (amount == 0) {
            throw ApiProblem.badRequest("nothing_added", "Say how much.");
        }
        LocalDate on = day == null ? LocalDate.now() : day;
        if (g.how() == HowFar.SOURCE) {
            // One number, kept in one place: what is added here is written where the number is counted.
            Optional<Lines> lines = lines(g, row.circleId(), me);
            if (lines.isEmpty() || !lines.get().canAdd()) {
                throw keptElsewhere(g, row.circleId(), me, lines.isPresent());
            }
            UUID line = numbers.get(g.sourceKind())
                    .add(row.circleId(), g.sourceRef(), me, by, amount, clean(note), on, clientId);
            thingStore.touch(goalId);
            return view(new EntryRow(line, goalId, by, amount, clean(note), on, Instant.now()), g, circle);
        }
        UUID id = goals.addEntry(goalId, by, amount, clean(note), on, clientId);
        thingStore.touch(goalId);
        return view(goals.entry(id).orElseThrow(), g, circle);
    }

    /** The lines the number of a goal that reads elsewhere is the sum of, when it is one this viewer can read. */
    private Optional<Lines> lines(GoalRow g, UUID circleId, UUID me) {
        return g.how() != HowFar.SOURCE || g.sourceKind() == null || !numbers.containsKey(g.sourceKind())
                ? Optional.empty()
                : numbers.get(g.sourceKind()).lines(circleId, g.sourceRef(), me);
    }

    /** Why nothing can be added on this goal's page, in plain words, with where to go instead. */
    private ApiProblem keptElsewhere(GoalRow g, UUID circleId, UUID me, boolean hasLines) {
        Optional<Reading> reading = numbers.containsKey(g.sourceKind())
                ? numbers.get(g.sourceKind()).read(circleId, g.sourceRef(), me)
                : Optional.empty();
        String where = reading.map(Reading::words).orElse(g.sourceWords());
        String from = where.isEmpty() ? "somewhere else" : where;
        if (hasLines) {
            return new ApiProblem(
                    HttpStatus.FORBIDDEN,
                    "kept_elsewhere",
                    "This goal reads its number from " + from + ", and you can't change that. Ask whoever can.");
        }
        return ApiProblem.conflict(
                "kept_elsewhere",
                g.sourceKind() == GoalSource.JOURNEY
                        ? "This goal counts " + from + ". It moves when a day is ticked there."
                        : reading.isPresent()
                                ? "This goal reads its number from " + from + ". Change it there and the goal moves."
                                : "This goal reads its number from " + from + ", which can't be opened just now.");
    }

    @Transactional
    public void removeEntry(UUID entryId, UUID me) {
        Optional<EntryRow> entry = goals.entry(entryId);
        if (entry.isEmpty()) {
            // Not one of a goal's own: a line of a number that is kept elsewhere (a row of the sheet the goal
            // reads) is taken back there, by that place's rules of who may. Anything else is gone already,
            // and removing what is gone is fine.
            for (GoalNumber number : numbers.values()) {
                if (number.remove(entryId, me)) {
                    return;
                }
            }
            return;
        }
        try {
            things.requireEdit(entry.get().goalId(), me, ThingKind.GOAL);
        } catch (ApiProblem problem) {
            throw problem.status() == HttpStatus.NOT_FOUND
                    ? new ApiProblem(HttpStatus.NOT_FOUND, "not_found", "That isn't there any more.")
                    : problem;
        }
        goals.removeEntry(entryId);
        thingStore.touch(entry.get().goalId());
    }

    public Page<EntryResponse> entries(UUID goalId, UUID me, Keyset page) {
        ThingRow row = things.require(goalId, me, ThingKind.GOAL);
        GoalRow g = goals.find(goalId).orElseThrow(ThingService::notFound);
        Map<UUID, Person> circle = people.in(row.circleId());
        Optional<Lines> lines = lines(g, row.circleId(), me);
        if (lines.isPresent()) {
            // The lines of the place it reads, the latest first. They are few (a table's rows), so a page is cut
            // from the whole: after the line the cursor names.
            List<Line> all = lines.get().all();
            int from = 0;
            if (!page.first()) {
                UUID after = page.uuid(0);
                from = all.size();
                for (int i = 0; i < all.size(); i++) {
                    if (all.get(i).id().equals(after)) {
                        from = i + 1;
                    }
                }
            }
            return page.page(
                            all.subList(from, Math.min(all.size(), from + page.fetch())),
                            line -> Keyset.cursor(line.id()))
                    .map(shown -> shown.stream()
                            .map(line -> view(line, goalId, g, circle))
                            .toList());
        }
        return page.page(goals.entries(goalId, page), e -> Keyset.cursor(e.onDay(), e.createdAt(), e.id()))
                .map(shown -> shown.stream().map(e -> view(e, g, circle)).toList());
    }

    // ---------- reading ----------

    public GoalResponse get(UUID id, UUID me, LocalDate today, Integer year) {
        ThingRow row = things.require(id, me, ThingKind.GOAL);
        GoalRow g = goals.find(id).orElseThrow(ThingService::notFound);
        LocalDate day = today == null ? LocalDate.now() : today;
        Standing standing =
                standings(List.of(new Goal(row, g)), row.circleId(), me, day).get(id);
        Map<UUID, Person> circle = people.in(row.circleId());
        int ofYear = year == null ? day.getYear() : year;
        return new GoalResponse(
                row.id(),
                row.circleId(),
                row.title(),
                g.blurb(),
                g.emoji(),
                media.urlFor(g.coverKey(), MediaSize.MEDIUM),
                g.unit(),
                g.currency(),
                g.unitWords(),
                standing.target(),
                standing.current(),
                say(g).apply(standing.current()),
                say(g).apply(standing.target()),
                g.how(),
                g.startsOn(),
                g.targetOn(),
                g.targetOn() == null ? null : "by " + Words.monthAndYear(g.targetOn()),
                standing.amountLine(),
                standing.line(),
                standing.pace(),
                standing.people(),
                standing.cheer(),
                standing.source(),
                standing.steps(),
                ofYear,
                standing.lines() == null
                        ? goals.months(id, ofYear)
                        : months(standing.lines().all(), ofYear),
                standing.lines() == null
                        ? goals.entries(id, Keyset.first(RECENT)).stream()
                                .limit(RECENT)
                                .map(e -> view(e, g, circle))
                                .toList()
                        : standing.lines().all().stream()
                                .limit(RECENT)
                                .map(line -> view(line, id, g, circle))
                                .toList(),
                g.how() != HowFar.SOURCE
                        || (standing.lines() != null && standing.lines().canAdd()),
                row.updatedAt(),
                row.mine(),
                row.canEdit(),
                things.chip(row));
    }

    /** The goals of a circle the viewer may see, in the order they were made. A hundred at most. */
    public List<GoalRowResponse> list(UUID circleId, UUID me, LocalDate today) {
        LocalDate day = today == null ? LocalDate.now() : today;
        List<Goal> all = goals.in(circleId, me);
        Map<UUID, Standing> standings = standings(all, circleId, me, day);
        Map<UUID, AudienceChip> chips =
                things.chips(all.stream().map(Goal::thing).toList());
        return all.stream()
                .map(goal -> {
                    Standing standing = standings.get(goal.thing().id());
                    return new GoalRowResponse(
                            goal.thing().id(),
                            goal.thing().circleId(),
                            goal.thing().title(),
                            goal.detail().emoji(),
                            media.urlFor(goal.detail().coverKey(), MediaSize.MEDIUM),
                            standing.pace().percent(),
                            standing.line(),
                            standing.pace().reached(),
                            goal.detail().sourceKind(),
                            goal.detail().unit(),
                            goal.detail().unitWords(),
                            standing.people(),
                            standing.cheer(),
                            goal.thing().updatedAt(),
                            goal.thing().mine(),
                            goal.thing().canEdit(),
                            chips.get(goal.thing().id()));
                })
                .toList();
    }

    /** "70% · €5,600 of €8,000" for each of these goals: what stands next to a goal in a list of mixed kinds. */
    public Map<UUID, String> glances(List<UUID> ids, UUID me) {
        Map<UUID, String> glances = new java.util.HashMap<>();
        goals.findAll(ids, me).stream()
                .collect(Collectors.groupingBy(goal -> goal.thing().circleId()))
                .forEach((circleId, ofCircle) -> standings(ofCircle, circleId, me, LocalDate.now())
                        .forEach((id, standing) ->
                                glances.put(id, standing.pace().percent() + "% · " + standing.amountLine())));
        return glances;
    }

    // ---------- where each goal stands ----------

    /** Where a goal stands for one viewer on one day. */
    record Standing(
            long target,
            long current,
            GoalPace pace,
            String amountLine,
            String line,
            List<PersonBrief> people,
            String cheer,
            SourceResponse source,
            StepsResponse steps,
            Lines lines) {}

    /** What the lines of a number that is kept elsewhere add up to in each month of a year, January first. */
    private static List<Long> months(List<Line> lines, int year) {
        long[] months = new long[12];
        for (Line line : lines) {
            if (line.day() != null && line.day().getYear() == year) {
                months[line.day().getMonthValue() - 1] += line.amount();
            }
        }
        return java.util.Arrays.stream(months).boxed().toList();
    }

    /** Works out where each of these goals of one circle stands, with a handful of questions for all of them. */
    private Map<UUID, Standing> standings(List<Goal> all, UUID circleId, UUID me, LocalDate today) {
        List<UUID> ids = all.stream().map(g -> g.thing().id()).toList();
        Map<UUID, Long> sums = goals.sums(ids);
        Map<UUID, List<UUID>> givers = goals.givers(ids);
        Map<UUID, Person> circle = people.in(circleId);
        // A list of steps counts only for someone who may see that list.
        List<UUID> listIds = all.stream()
                .map(g -> g.detail().stepsListId())
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        Map<UUID, ThingRow> lists =
                thingStore.findAll(listIds, me).stream().collect(Collectors.toMap(ThingRow::id, l -> l));
        Map<UUID, Tally> tallies = checklistStore.tallies(List.copyOf(lists.keySet()));
        long persons =
                circle.values().stream().filter(p -> p.kind() != MemberKind.PET).count();
        return all.stream().collect(Collectors.toMap(goal -> goal.thing().id(), goal -> {
            GoalRow g = goal.detail();
            long byHand = sums.getOrDefault(g.id(), 0L);
            long current = byHand;
            long target = g.target();
            ThingRow list = g.stepsListId() == null ? null : lists.get(g.stepsListId());
            Tally tally = list == null ? null : tallies.getOrDefault(list.id(), new Tally(0, 0));
            StepsResponse steps =
                    list == null ? null : new StepsResponse(list.id(), list.title(), tally.left(), tally.done());
            SourceResponse source = null;
            Lines lines = null;
            if (g.how() == HowFar.TICKS && tally != null) {
                current = tally.done();
                target = Math.max(1, tally.done() + tally.left());
            }
            if (g.sourceKind() != null) {
                Optional<Reading> reading = g.how() != HowFar.SOURCE || !numbers.containsKey(g.sourceKind())
                        ? Optional.empty()
                        : numbers.get(g.sourceKind()).read(circleId, g.sourceRef(), me);
                if (reading.isPresent()) {
                    current = reading.get().number();
                    // Who put in what is read where the number is, when it is a sum of lines.
                    lines = lines(g, circleId, me).orElse(null);
                }
                String words = reading.map(Reading::words).orElse(g.sourceWords());
                source = new SourceResponse(
                        g.sourceKind(),
                        g.sourceRef(),
                        words.isEmpty()
                                ? (g.sourceKind() == GoalSource.JOURNEY
                                        ? "Reads a challenge in Journey"
                                        : "Reads a sheet")
                                : "Reads " + words,
                        reading.isPresent(),
                        reading.map(Reading::thingId).orElse(null),
                        reading.map(Reading::thingKind).orElse(null));
            }
            LongFunction<String> say = say(g);
            GoalPace pace = GoalPace.work(
                    target, current, g.startsOn(), g.targetOn(), today, g.unit() == GoalUnit.MONEY ? 100 : 1, say);
            // Whoever began first comes first. The lines of a number kept elsewhere are read the latest first.
            List<UUID> gave = lines == null
                    ? givers.getOrDefault(g.id(), List.of())
                    : lines.all().reversed().stream()
                            .map(Line::memberId)
                            .filter(Objects::nonNull)
                            .distinct()
                            .toList();
            List<PersonBrief> who = gave.stream()
                    .map(circle::get)
                    .filter(Objects::nonNull)
                    .map(Person::brief)
                    .toList();
            String amountLine = say.apply(current) + " of " + say.apply(target)
                    + (g.unit() == GoalUnit.COUNT && !g.unitWords().isEmpty() ? " " + g.unitWords() : "");
            return new Standing(
                    target,
                    current,
                    pace,
                    amountLine,
                    line(g, pace, current, target, amountLine, who.size()),
                    who,
                    cheer(who, persons),
                    source,
                    steps,
                    lines);
        }));
    }

    /** The line under a goal's name in the list of goals. */
    private static String line(GoalRow g, GoalPace pace, long current, long target, String amountLine, int givers) {
        if (g.sourceKind() == GoalSource.JOURNEY && g.how() == HowFar.SOURCE) {
            return "Day " + Amounts.count(current) + " of " + Amounts.count(target) + " in Journey";
        }
        if (pace.reached()) {
            return amountLine + " · reached";
        }
        if (g.unit() == GoalUnit.MONEY) {
            if (g.targetOn() == null) {
                return pace.toGoLine();
            }
            return amountLine + " · "
                    + (pace.timeLine() != null && pace.timeLine().startsWith("Past")
                            ? "past its day"
                            : (Boolean.TRUE.equals(pace.onTrack()) ? "on track for " : "behind for ")
                                    + Words.month(g.targetOn()));
        }
        return amountLine + (g.unitWords().isEmpty() && givers > 1 ? " · together" : "");
    }

    /** "All four chip in" when everyone has, "Alex and Mia chip in" for a few, nothing when nobody has yet. */
    private static String cheer(List<PersonBrief> who, long persons) {
        if (who.isEmpty()) {
            return "";
        }
        if (who.size() == 1) {
            return who.get(0).name() + " chips in";
        }
        if (who.size() == persons) {
            return who.size() == 2 ? "Both chip in" : "All " + Words.number(who.size()) + " chip in";
        }
        return who.size() <= 3
                ? Words.list(who.stream().map(PersonBrief::name).toList()) + " chip in"
                : Words.capital(Words.number(who.size())) + " chip in";
    }

    private static LongFunction<String> say(GoalRow g) {
        return g.unit() == GoalUnit.MONEY ? amount -> Amounts.money(amount, g.currency()) : Amounts::count;
    }

    /** A line of the place the goal reads, shown as an entry of the goal. */
    private EntryResponse view(Line line, UUID goalId, GoalRow g, Map<UUID, Person> circle) {
        return view(
                new EntryRow(line.id(), goalId, line.memberId(), line.amount(), line.note(), line.day(), null),
                g,
                circle);
    }

    private EntryResponse view(EntryRow e, GoalRow g, Map<UUID, Person> circle) {
        Person by = e.memberId() == null ? null : circle.get(e.memberId());
        String amount = say(g).apply(Math.abs(e.amount()))
                + (g.unit() == GoalUnit.COUNT && !g.unitWords().isEmpty() ? " " + g.unitWords() : "");
        return new EntryResponse(
                e.id(),
                by == null ? null : by.brief(),
                e.amount(),
                (by == null ? "Someone" : by.name()) + (e.amount() < 0 ? " took out " : " added ") + amount,
                e.note(),
                e.onDay());
    }

    private UUID myMember(UUID circleId, UUID me) {
        return myMember(people.in(circleId), me);
    }

    private static UUID myMember(Map<UUID, Person> circle, UUID me) {
        return circle.values().stream()
                .filter(p -> me.equals(p.userId()))
                .map(Person::id)
                .findFirst()
                .orElseThrow(ThingService::notFound);
    }

    private static String clean(String text) {
        return text == null ? "" : text.trim().replaceAll("\\s+", " ");
    }
}
