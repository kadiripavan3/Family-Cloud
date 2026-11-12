package app.homeport.api.board.templates;

import app.homeport.api.activity.PastTense;
import app.homeport.api.board.BoardRules;
import app.homeport.api.board.BoardStore.Tally;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Person;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.home.TodaySource.TodayItem;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.time.temporal.IsoFields;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * The chore wheel: jobs that change hands every Monday, ticks that earn stars, and a count per person.
 *
 * <p><b>The rule of the wheel.</b> The people on the wheel stand in a fixed order, and so do the jobs. In the
 * week the wheel was started, the first job is the first person's, the second job the second person's, and
 * so on round the wheel. Every Monday each job moves on to the next person: in week {@code w} (0 for the
 * starting week), job number {@code j} is done by person number {@code (j + w) mod n} of {@code n} people.
 * With more jobs than people someone has two; with more people than jobs someone has a week off. Nobody is
 * stuck with the bins.
 *
 * <p><b>Ticks and stars.</b> A job is ticked once for a day it was done, up to the number of times a week
 * it is meant to be done ("5 of 7 days"). Every tick is a star for the person whose job it was that week,
 * whoever pressed it: a child's tick is pressed on a parent's phone. Stars are never taken back when a job is
 * retired; removing a job only takes it off the wheel.
 *
 * <p>Nothing here is secret: everyone who sees the wheel sees all of it.
 */
@Component
class ChoreWheel implements BoardRules {

    static final String JOB = "job";
    static final String TICK = "tick";

    // ---------- what is stored ----------

    record ChoreWheelSettings(
            @Schema(description = "The members on the wheel, in its order")
            List<UUID> people,

            @Schema(description = "The Monday of the week the wheel was started: where the turning is counted from")
            LocalDate startsOn,

            @Schema(nullable = true, description = "What stars turn into, when the family set that")
            ChoreWheelStars stars) {
        ChoreWheelSettings {
            people = people == null ? List.of() : List.copyOf(people);
        }
    }

    /** "10 stars pay €2 into Mia's skates fund". Kept as the family's own agreement; paying in is done in Money. */
    record ChoreWheelStars(
            int stars,
            long cents,
            String currency,

            @Schema(nullable = true, description = "What they pay into, in the family's words")
            String into) {}

    record Job(String name, String emoji, String when, Integer timesAWeek, Boolean retired) {
        int times() {
            return timesAWeek == null ? 1 : timesAWeek;
        }

        boolean gone() {
            return Boolean.TRUE.equals(retired);
        }
    }

    // ---------- what a person sees ----------

    record ChoreWheelView(
            @Schema(description = "The number of the week shown, as calendars count it")
            int week,

            LocalDate weekStart,
            LocalDate weekEnd,

            @Schema(description = "The people on the wheel, in its order, with their stars")
            List<ChoreWheelPerson> people,

            @Schema(description = "The jobs, in the wheel's order, with whose they are in the week shown")
            List<ChoreWheelJob> jobs,

            @Schema(description = "How many jobs are done for the week shown")
            int done,

            @Schema(nullable = true) ChoreWheelStars stars) {}

    record ChoreWheelPerson(
            PersonBrief person,
            MemberKind kind,

            @Schema(description = "Every star they ever earned on this wheel")
            long stars) {}

    record ChoreWheelJob(
            UUID id,
            String name,
            @Schema(nullable = true) String emoji,

            @Schema(nullable = true, description = "When it is done, in the family's words: Tuesday and Friday evening")
            String when,

            @Schema(description = "How many times a week it is meant to be done")
            int timesAWeek,

            @Schema(nullable = true, description = "Whose job it is in the week shown")
            PersonBrief who,

            @Schema(nullable = true, description = "Whose it will be the week after")
            PersonBrief next,

            @Schema(description = "How many times it was ticked in the week shown")
            int doneThisWeek,

            @Schema(description = "The days of the week shown on which it was ticked")
            List<LocalDate> doneOn,

            @Schema(description = "True when it was ticked on the viewer's today")
            boolean doneToday,

            @Schema(description = "True when it was ticked as often as it is meant to be")
            boolean complete,

            @Schema(nullable = true, description = "When it was last ticked in the week shown")
            Instant lastDoneAt) {}

    @Override
    public Template template() {
        return Template.CHORE_WHEEL;
    }

    @Override
    public Class<?> settingsType() {
        return ChoreWheelSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return ChoreWheelView.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: people (member ids in the wheel's order; left out: everyone in the circle), stars"
                        + " ({stars, cents, currency, into} or null)",
                "entry job: name, emoji, when (words), timesAWeek (1 to 7)",
                "verb tick: jobId, done (true or false; left out: true), day (a date; left out: today)",
                "show: any day of the week to show, as a date. Left out: this week.");
    }

    @Override
    public Set<String> counted() {
        return Set.of(TICK);
    }

    @Override
    public int ceiling() {
        return 20000;
    }

    // ---------- the rule of the wheel ----------

    /** How many Mondays have passed since the wheel was started; negative for a week before that. */
    static int weekIndex(LocalDate startsOn, LocalDate day) {
        return (int) Math.floorDiv(ChronoUnit.DAYS.between(MealPlan.monday(startsOn), MealPlan.monday(day)), 7L);
    }

    /** Whose turn a job is in a week: job j in week w belongs to person (j + w) mod n. Null on an empty wheel. */
    static <T> T turn(List<T> people, int jobIndex, int weekIndex) {
        return people.isEmpty() ? null : people.get(Math.floorMod(jobIndex + weekIndex, people.size()));
    }

    /** The people on the wheel who are still in the circle, in the wheel's order. */
    private static List<UUID> wheel(Scene scene, ChoreWheelSettings settings) {
        return settings.people().stream()
                .filter(id -> scene.person(id) != null && !scene.person(id).left())
                .toList();
    }

    private static List<EntryRow> jobs(Scene scene) {
        return scene.entries(JOB).stream().filter(j -> !j.as(Job.class).gone()).toList();
    }

    // ---------- settings ----------

    @Override
    public Object settings(Scene scene, Fields sent) {
        ChoreWheelSettings now = scene.isNew()
                ? new ChoreWheelSettings(
                        scene.humans().stream().map(Person::id).toList(), MealPlan.monday(scene.today()), null)
                : scene.settings(ChoreWheelSettings.class);
        List<UUID> people = sent.ids("people", 30);
        if (people == null) {
            people = now.people();
        }
        for (UUID id : people) {
            scene.inCircle(id);
            if (scene.person(id).kind() == MemberKind.PET) {
                throw ApiProblem.badRequest("not_a_person", "A pet can't have a job on the wheel.");
            }
        }
        if (people.isEmpty()) {
            throw ApiProblem.badRequest("nobody_chosen", "Put at least one person on the wheel.");
        }
        ChoreWheelStars stars = now.stars();
        if (sent.has("stars")) {
            Fields rule = sent.inside("stars");
            Long count = rule.whole("stars", 1, 1000);
            Long cents = rule.whole("cents", 1, 1_000_000);
            stars = count == null || cents == null
                    ? null
                    : new ChoreWheelStars(
                            count.intValue(), cents, rule.text("currency", 3, "EUR"), rule.text("into", 80));
        }
        return new ChoreWheelSettings(people, now.startsOn(), stars);
    }

    // ---------- what a person sees ----------

    @Override
    public Object view(Scene scene, String show) {
        ChoreWheelSettings settings = scene.settings(ChoreWheelSettings.class);
        LocalDate day = show == null ? scene.today() : shown(show);
        LocalDate monday = MealPlan.monday(day);
        List<ChoreWheelJob> jobs = jobsOf(scene, settings, monday);
        Map<UUID, Tally> stars = scene.tallies(TICK);
        return new ChoreWheelView(
                monday.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR),
                monday,
                monday.plusDays(6),
                wheel(scene, settings).stream()
                        .map(id -> new ChoreWheelPerson(
                                scene.brief(id),
                                scene.person(id).kind(),
                                stars.getOrDefault(id, new Tally(0, 0)).sum()))
                        .toList(),
                jobs,
                (int) jobs.stream().filter(ChoreWheelJob::complete).count(),
                settings.stars());
    }

    private static LocalDate shown(String show) {
        try {
            return LocalDate.parse(show);
        } catch (RuntimeException notADay) {
            throw ApiProblem.badRequest("invalid_show", "Choose a week by one of its days.");
        }
    }

    /** The jobs of the week that starts on this Monday: whose each one is, and how far it got. */
    private List<ChoreWheelJob> jobsOf(Scene scene, ChoreWheelSettings settings, LocalDate monday) {
        List<UUID> wheel = wheel(scene, settings);
        int week = weekIndex(settings.startsOn(), monday);
        Map<UUID, List<EntryRow>> ticks = scene.between(TICK, monday, monday.plusDays(6)).stream()
                .filter(t -> t.parentId() != null)
                .collect(Collectors.groupingBy(EntryRow::parentId));
        List<ChoreWheelJob> shown = new ArrayList<>();
        int index = 0;
        for (EntryRow row : jobs(scene)) {
            Job job = row.as(Job.class);
            List<EntryRow> done = ticks.getOrDefault(row.id(), List.of());
            shown.add(new ChoreWheelJob(
                    row.id(),
                    job.name(),
                    job.emoji(),
                    job.when(),
                    job.times(),
                    scene.brief(turn(wheel, index, week)),
                    scene.brief(turn(wheel, index, week + 1)),
                    done.size(),
                    done.stream().map(EntryRow::day).sorted().toList(),
                    done.stream().anyMatch(t -> scene.today().equals(t.day())),
                    done.size() >= job.times(),
                    done.stream()
                            .map(EntryRow::doneAt)
                            .filter(Objects::nonNull)
                            .max(Comparator.naturalOrder())
                            .orElse(null)));
            index++;
        }
        return shown;
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        if (!entry.is(JOB)) {
            return null;
        }
        Job job = entry.as(Job.class);
        return job.gone() ? null : job.name() + (job.when() == null ? "" : " · " + job.when());
    }

    // ---------- changing it ----------

    private static Job job(Fields sent, Job now) {
        String name = sent.text("name", 80, now.name());
        if (name == null) {
            throw ApiProblem.badRequest("missing_name", "Give the job a name.");
        }
        return new Job(
                name,
                sent.text("emoji", 16, now.emoji()),
                sent.text("when", 80, now.when()),
                sent.count("timesAWeek", 1, 7, now.times()),
                now.retired());
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        return switch (kind) {
            case JOB -> {
                if (jobs(scene).size() >= 20) {
                    throw ApiProblem.conflict("too_many", "Twenty jobs is as many as a wheel holds.");
                }
                yield scene.add(
                        EntryDraft.of(JOB).by(scene.myId()).doc(job(sent, new Job(null, null, null, null, null))),
                        clientId);
            }
            default -> throw BoardRules.unknownKind();
        };
    }

    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        if (!entry.is(JOB)) {
            throw BoardRules.unknownKind();
        }
        scene.save(entry, EntryDraft.from(entry).doc(job(sent, entry.as(Job.class))));
    }

    /** A job is taken off the wheel, not deleted: the stars earned for it stay earned. */
    @Override
    public void remove(Scene scene, EntryRow entry) {
        if (entry.is(JOB)) {
            Job job = entry.as(Job.class);
            scene.save(
                    entry,
                    EntryDraft.from(entry).doc(new Job(job.name(), job.emoji(), job.when(), job.timesAWeek(), true)));
        } else {
            scene.remove(entry.id());
        }
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        if (!verb.equals(TICK)) {
            throw BoardRules.unknownVerb();
        }
        tick(scene, sent);
    }

    private static LocalDate day(Scene scene, Fields sent) {
        LocalDate day = sent.day("day", scene.today());
        if (day == null
                || day.isAfter(scene.today())
                || day.isBefore(scene.today().minusDays(31))) {
            throw ApiProblem.badRequest("invalid_day", "A job can be ticked for today or one of the last few weeks.");
        }
        return day;
    }

    /** Ticks a job for a day, or takes that day's tick away. Ticking twice is one tick; a finished week takes no more. */
    private void tick(Scene scene, Fields sent) {
        EntryRow job = scene.need(sent.id("jobId"));
        if (!job.is(JOB) || job.as(Job.class).gone()) {
            throw Scene.entryGone();
        }
        LocalDate day = day(scene, sent);
        LocalDate monday = MealPlan.monday(day);
        List<EntryRow> week = scene.between(TICK, monday, monday.plusDays(6)).stream()
                .filter(t -> job.id().equals(t.parentId()))
                .toList();
        EntryRow there =
                week.stream().filter(t -> day.equals(t.day())).findFirst().orElse(null);
        if (!sent.flag("done", true)) {
            if (there != null) {
                scene.remove(there.id());
            }
            return;
        }
        if (there != null || week.size() >= job.as(Job.class).times()) {
            return;
        }
        ChoreWheelSettings settings = scene.settings(ChoreWheelSettings.class);
        List<EntryRow> jobs = jobs(scene);
        int index = 0;
        while (!jobs.get(index).id().equals(job.id())) {
            index++;
        }
        UUID whose = turn(wheel(scene, settings), index, weekIndex(settings.startsOn(), day));
        scene.add(
                EntryDraft.of(TICK)
                        .under(job.id())
                        .by(scene.myId())
                        .forMember(whose)
                        .day(day)
                        .done(scene.now(), scene.myId())
                        .amount(1L),
                Scene.derivedId(job.id(), "tick " + day));
        // Whose job it was did it, whoever's phone the tick was made on: "Leo fed Biscuit and earned a star".
        scene.tell(whose, PastTense.of(job.as(Job.class).name()) + " and earned a star");
    }

    // ---------- what it brings to the rest ----------

    @Override
    public String glance(Scene scene) {
        ChoreWheelSettings settings = scene.settings(ChoreWheelSettings.class);
        LocalDate monday = MealPlan.monday(scene.today());
        List<ChoreWheelJob> jobs = jobsOf(scene, settings, monday);
        return "Week " + monday.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR) + " · "
                + jobs.stream().filter(ChoreWheelJob::complete).count() + " of " + jobs.size() + " done";
    }

    /** The viewer's own jobs this week, and those of the children they tick for. */
    @Override
    public List<TodayItem> today(Scene scene) {
        ChoreWheelSettings settings = scene.settings(ChoreWheelSettings.class);
        return jobsOf(scene, settings, MealPlan.monday(scene.today())).stream()
                .filter(job -> job.who() != null && scene.iStandInFor(job.who().memberId()))
                .map(job -> new TodayItem(
                        scene.boardId(),
                        ThingKind.BOARD,
                        job.name(),
                        (scene.isMe(job.who().memberId()) ? "Your" : job.who().name() + "'s") + " job this week"
                                + (job.when() == null ? "" : " · " + job.when()),
                        null,
                        job.complete() || job.doneToday(),
                        1440,
                        scene.avatars(job.who().memberId())))
                .toList();
    }

    @Override
    public String guest(Scene scene) {
        ChoreWheelSettings settings = scene.settings(ChoreWheelSettings.class);
        return jobsOf(scene, settings, MealPlan.monday(scene.today())).stream()
                .map(job -> job.name() + ": "
                        + (job.who() == null ? "nobody this week" : job.who().name()))
                .collect(Collectors.joining("\n"));
    }
}
