package app.homeport.api.board.templates;

import app.homeport.api.board.BoardRules;
import app.homeport.api.board.BoardStore.Tally;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Person;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.board.Words;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * Habit charts: a tick a day. Bed made, bag packed, twenty minutes of reading; phones off the table for the
 * grown-ups.
 *
 * <p><b>The rules.</b> A chart has one to three rows (morning and evening, say) and the days of the week it
 * is on (every day, unless it says otherwise). A row is ticked once for a day. On a child's chart every tick
 * is a star, for good. A day is kept when all its rows are ticked; the streak is how many days in a row were
 * kept, counted back from today, or from yesterday while today is still open. Days the chart isn't on don't
 * break it.
 *
 * <p><b>A missed day is a gap, not a failure.</b> Nothing resets: stars are never taken away for a gap, and a
 * chart that is taken down keeps the stars earned on it. A tick can be given for today or one of the last
 * seven days, by anyone who sees the chart: a child's tick is pressed on a parent's phone.
 *
 * <p>Nothing here is about health, and nothing is secret: everyone who sees the charts sees all of them.
 */
@Component
class HabitCharts implements BoardRules {

    static final String CHART = "chart";
    static final String TICK = "tick";
    private static final int MAX_CHARTS = 30;
    /** How far back ticks are read: the longest streak that is counted. */
    static final int WINDOW = 100;

    private static final List<String> DAYS = List.of("mon", "tue", "wed", "thu", "fri", "sat", "sun");

    record HabitChartsSettings() {}

    /**
     * @param people the members it is for. Empty: everyone.
     * @param days the days of the week it is on, as mon to sun. Empty: every day.
     * @param stars true when every tick is a star for its person
     * @param unit what a kept day is called, when not "day": dinner
     */
    record Chart(
            String title,
            String emoji,
            List<UUID> people,
            List<Row> rows,
            List<String> days,
            Boolean stars,
            String unit,
            Boolean retired) {
        Chart {
            people = people == null ? List.of() : List.copyOf(people);
            rows = rows == null || rows.isEmpty() ? List.of(new Row(null, null)) : List.copyOf(rows);
            days = days == null ? List.of() : List.copyOf(days);
        }

        boolean earnsStars() {
            return Boolean.TRUE.equals(stars);
        }

        boolean gone() {
            return Boolean.TRUE.equals(retired);
        }

        Set<DayOfWeek> on() {
            return days.isEmpty()
                    ? EnumSet.allOf(DayOfWeek.class)
                    : days.stream()
                            .map(day -> DayOfWeek.of(DAYS.indexOf(day) + 1))
                            .collect(Collectors.toCollection(() -> EnumSet.noneOf(DayOfWeek.class)));
        }
    }

    /** @param icon a word the app has a picture for: sun, moon, book */
    record Row(String label, String icon) {}

    /** @param row which row of its chart was ticked, counted from 0 */
    record Tick(Integer row) {}

    record HabitChartsResponse(
            @Schema(description = "The Monday of the week shown")
            LocalDate weekStart,

            LocalDate weekEnd,

            @Schema(description = "The charts, in their order. Thirty at most.")
            List<HabitChartsChartResponse> charts) {}

    record HabitChartsChartResponse(
            UUID id,
            String title,
            @Schema(nullable = true) String emoji,

            @Schema(description = "Who it is for. Empty: everyone.")
            List<PersonBrief> people,

            @Schema(description = "Who it is for, in words: Leo, Everyone, You and Alex")
            String who,

            @Schema(description = "True on a chart whose ticks are stars")
            boolean earnsStars,

            @Schema(nullable = true, description = "Every star its person ever earned on these charts")
            Long stars,

            @Schema(description = "The days of the week it is on, as mon to sun. Empty: every day.")
            List<String> days,

            @Schema(description = "Its rows, each with the seven days of the week shown")
            List<HabitChartsRowResponse> rows,

            @Schema(description = "Ticks given in the week shown")
            int doneThisWeek,

            @Schema(description = "Ticks there could have been in the week shown, up to today")
            int possibleSoFar,

            @Schema(description = "How many days in a row were kept, up to today (100 at most)")
            int streak,

            @Schema(description = "True when it is on today")
            boolean dueToday,

            @Schema(description = "True when every row is ticked for today")
            boolean doneToday,

            @Schema(description = "The small line under its name: 5 of 6 so far this week, 9 days in a row, Thursdays")
            String line) {}

    record HabitChartsRowResponse(
            @Schema(description = "Which row, counted from 0")
            int row,

            @Schema(nullable = true) String label,

            @Schema(nullable = true, description = "A word the app has a picture for: sun, moon, book")
            String icon,

            @Schema(description = "Seven days, Monday first")
            List<HabitChartsCellResponse> cells) {}

    record HabitChartsCellResponse(
            LocalDate day,

            @Schema(description = "True when the chart is on that day")
            boolean due,

            boolean done,
            boolean today) {}

    @Override
    public Template template() {
        return Template.HABIT_CHARTS;
    }

    @Override
    public Class<?> settingsType() {
        return HabitChartsSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return HabitChartsResponse.class;
    }

    @Override
    public Class<?> entryType() {
        return HabitChartsChartResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: none",
                "entry chart: title, emoji, people (member ids; left out or empty: everyone), rows (one to three of"
                        + " {label, icon}; left out: one row), days (mon to sun; left out or empty: every day), stars"
                        + " (true when every tick is a star; left out: true for one child's chart), unit (what a"
                        + " kept day is called when not “day”: dinner)",
                "verb tick: chartId, row (counted from 0; left out: 0), day (today or one of the last seven days;"
                        + " left out: today), done (left out: true; false takes the tick back). Everyone who sees"
                        + " the charts may tick, also with a board they may only look at.",
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

    @Override
    public boolean viewersMay(String verb) {
        return verb.equals(TICK);
    }

    // ---------- the rules ----------

    /**
     * How many days in a row were kept, counted back from today. Today counts when it is kept; while it is
     * still open the count starts from the day before. Days the chart isn't on are stepped over.
     *
     * @param kept the days on which every row was ticked
     * @param due true for a day the chart is on
     * @param earliest the count stops here
     */
    static int streak(Set<LocalDate> kept, Predicate<LocalDate> due, LocalDate today, LocalDate earliest) {
        int streak = 0;
        for (LocalDate day = today; !day.isBefore(earliest); day = day.minusDays(1)) {
            if (!due.test(day)) {
                continue;
            }
            if (kept.contains(day)) {
                streak++;
            } else if (!day.equals(today)) {
                break;
            }
        }
        return streak;
    }

    /** The small line under a chart's name. */
    static String line(int rows, List<String> days, int done, int possible, int streak, String unit) {
        if (rows > 1) {
            return done + " of " + possible + " so far this week";
        }
        if (!days.isEmpty() && days.size() < 7) {
            return Phrases.list(days.stream()
                    .map(day -> Phrases.weekday(LocalDate.of(2024, 1, 1).plusDays(DAYS.indexOf(day))) + "s")
                    .toList());
        }
        String one = unit == null ? "day" : unit;
        if (streak == 0) {
            return "Ready for a first tick";
        }
        if (streak == 1) {
            return "1 " + one + " so far";
        }
        return streak + " " + one + "s " + (unit == null ? "in a row" : "running");
    }

    private static List<EntryRow> charts(Scene scene) {
        return scene.entries(CHART).stream()
                .filter(chart -> !chart.as(Chart.class).gone())
                .toList();
    }

    /** The ticks of the last hundred days, and of the week shown when that is further back, by chart. */
    private static Map<UUID, List<EntryRow>> ticks(Scene scene, LocalDate monday) {
        LocalDate from = scene.today().minusDays(WINDOW);
        return scene
                .between(
                        TICK,
                        monday.isBefore(from) ? monday : from,
                        scene.today().plusDays(1))
                .stream()
                .filter(tick -> tick.parentId() != null)
                .collect(Collectors.groupingBy(EntryRow::parentId));
    }

    // ---------- settings ----------

    @Override
    public Object settings(Scene scene, Fields sent) {
        return new HabitChartsSettings();
    }

    // ---------- what a person sees ----------

    @Override
    public Object view(Scene scene, String show) {
        LocalDate shown = scene.today();
        if (show != null) {
            try {
                shown = LocalDate.parse(show);
            } catch (RuntimeException notADay) {
                throw ApiProblem.badRequest("invalid_show", "Choose a week by one of its days.");
            }
        }
        LocalDate monday = MealPlan.monday(shown);
        Map<UUID, List<EntryRow>> ticks = ticks(scene, monday);
        Map<UUID, Tally> stars = scene.tallies(TICK);
        return new HabitChartsResponse(
                monday,
                monday.plusDays(6),
                charts(scene).stream()
                        .map(chart -> chart(scene, chart, ticks.getOrDefault(chart.id(), List.of()), stars, monday))
                        .toList());
    }

    private static HabitChartsChartResponse chart(
            Scene scene, EntryRow row, List<EntryRow> ticks, Map<UUID, Tally> stars, LocalDate monday) {
        Chart chart = row.as(Chart.class);
        Set<DayOfWeek> on = chart.on();
        LocalDate today = scene.today();
        // Which rows were ticked on which day.
        Map<LocalDate, Set<Integer>> done = ticks.stream()
                .collect(Collectors.groupingBy(
                        EntryRow::day,
                        Collectors.mapping(
                                tick -> Objects.requireNonNullElse(
                                        tick.as(Tick.class).row(), 0),
                                Collectors.toSet())));
        int rows = chart.rows().size();
        Set<LocalDate> kept = done.entrySet().stream()
                .filter(day -> day.getValue().size() >= rows)
                .map(Map.Entry::getKey)
                .collect(Collectors.toSet());
        List<HabitChartsRowResponse> shown = new ArrayList<>();
        int doneThisWeek = 0;
        int possible = 0;
        for (int index = 0; index < rows; index++) {
            List<HabitChartsCellResponse> cells = new ArrayList<>();
            for (LocalDate day = monday; day.isBefore(monday.plusDays(7)); day = day.plusDays(1)) {
                boolean due = on.contains(day.getDayOfWeek());
                boolean ticked = done.getOrDefault(day, Set.of()).contains(index);
                cells.add(new HabitChartsCellResponse(day, due, ticked, day.equals(today)));
                doneThisWeek += ticked ? 1 : 0;
                possible += due && !day.isAfter(today) ? 1 : 0;
            }
            Row labelled = chart.rows().get(index);
            shown.add(new HabitChartsRowResponse(index, labelled.label(), labelled.icon(), cells));
        }
        int streak = streak(kept, day -> on.contains(day.getDayOfWeek()), today, today.minusDays(WINDOW));
        List<UUID> people = chart.people().stream()
                .filter(id -> scene.person(id) != null && !scene.person(id).left())
                .toList();
        UUID one = people.size() == 1 ? people.get(0) : null;
        return new HabitChartsChartResponse(
                row.id(),
                chart.title(),
                chart.emoji(),
                people.stream().map(scene::brief).toList(),
                who(scene, people),
                chart.earnsStars(),
                chart.earnsStars() && one != null
                        ? Long.valueOf(stars.getOrDefault(one, new Tally(0, 0)).sum())
                        : null,
                chart.days(),
                shown,
                doneThisWeek,
                possible,
                streak,
                on.contains(today.getDayOfWeek()),
                kept.contains(today),
                line(rows, chart.days(), doneThisWeek, possible, streak, chart.unit()));
    }

    /** "Leo", "Everyone", "You and Alex": the viewer first, as "You". */
    private static String who(Scene scene, List<UUID> people) {
        if (people.isEmpty()) {
            return "Everyone";
        }
        List<String> names = new ArrayList<>();
        if (people.stream().anyMatch(scene::isMe) && people.size() > 1) {
            names.add("You");
        }
        people.stream()
                .filter(id -> people.size() == 1 || !scene.isMe(id))
                .map(scene::firstName)
                .forEach(names::add);
        return Phrases.list(names);
    }

    @Override
    public Object entry(Scene scene, EntryRow entry) {
        if (!entry.is(CHART) || entry.as(Chart.class).gone()) {
            return null;
        }
        LocalDate monday = MealPlan.monday(scene.today());
        return chart(
                scene, entry, ticks(scene, monday).getOrDefault(entry.id(), List.of()), scene.tallies(TICK), monday);
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        if (!entry.is(CHART)) {
            return null;
        }
        Chart chart = entry.as(Chart.class);
        return chart.gone() ? null : chart.title();
    }

    // ---------- changing it ----------

    private static Chart chart(Scene scene, Fields sent, Chart now) {
        String title = sent.text("title", 120, now.title());
        if (title == null) {
            throw ApiProblem.badRequest("missing_title", "Give the chart a name.");
        }
        List<UUID> people = sent.ids("people", 30);
        if (people == null) {
            people = now.people();
        }
        for (UUID id : people) {
            scene.inCircle(id);
            if (scene.person(id).kind() == MemberKind.PET) {
                throw ApiProblem.badRequest("not_a_person", "A chart is for people.");
            }
        }
        List<Row> rows = now.rows();
        List<Fields> sentRows = sent.list("rows", 3);
        if (sentRows != null && !sentRows.isEmpty()) {
            rows = sentRows.stream()
                    .map(row -> new Row(row.text("label", 60), row.text("icon", 20)))
                    .toList();
        }
        List<String> days = sent.texts("days", 7, 3);
        if (days == null) {
            days = now.days();
        } else {
            days = days.stream()
                    .map(day -> day.toLowerCase(Locale.ROOT))
                    .distinct()
                    .toList();
            if (!DAYS.containsAll(days)) {
                throw ApiProblem.badRequest("invalid_days", "Write the days as mon, tue, wed, thu, fri, sat or sun.");
            }
            days = DAYS.stream().filter(new HashSet<>(days)::contains).toList();
        }
        // Left to itself, one child's chart earns stars and nobody else's does.
        Person only = people.size() == 1 ? scene.person(people.get(0)) : null;
        boolean stars = sent.flag("stars", now.stars() != null ? now.earnsStars() : only != null && !only.grownUp());
        return new Chart(
                title,
                sent.text("emoji", 16, now.emoji()),
                people,
                rows,
                days,
                stars,
                sent.text("unit", 20, now.unit()),
                now.retired());
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        if (!kind.equals(CHART)) {
            throw BoardRules.unknownKind();
        }
        if (charts(scene).size() >= MAX_CHARTS) {
            throw ApiProblem.conflict("too_many", "Thirty charts is as many as fit here.");
        }
        return scene.add(
                EntryDraft.of(CHART)
                        .by(scene.myId())
                        .doc(chart(scene, sent, new Chart(null, null, null, null, null, null, null, null))),
                clientId);
    }

    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        if (!entry.is(CHART)) {
            throw BoardRules.unknownKind();
        }
        scene.save(entry, EntryDraft.from(entry).doc(chart(scene, sent, entry.as(Chart.class))));
    }

    /** A chart is taken down, not deleted: the stars earned on it stay earned. */
    @Override
    public void remove(Scene scene, EntryRow entry) {
        if (!entry.is(CHART)) {
            scene.remove(entry.id());
            return;
        }
        Chart chart = entry.as(Chart.class);
        scene.save(
                entry,
                EntryDraft.from(entry)
                        .doc(new Chart(
                                chart.title(),
                                chart.emoji(),
                                chart.people(),
                                chart.rows(),
                                chart.days(),
                                chart.stars(),
                                chart.unit(),
                                true)));
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        if (!verb.equals(TICK)) {
            throw BoardRules.unknownVerb();
        }
        EntryRow row = scene.need(sent.id("chartId"));
        if (!row.is(CHART) || row.as(Chart.class).gone()) {
            throw Scene.entryGone();
        }
        Chart chart = row.as(Chart.class);
        int index = Phrases.number(sent, "row", 0, chart.rows().size() - 1, 0);
        LocalDate day = sent.day("day", scene.today());
        if (day == null
                || day.isAfter(scene.today())
                || day.isBefore(scene.today().minusDays(7))) {
            throw ApiProblem.badRequest("invalid_day", "A tick is for today or one of the last seven days.");
        }
        if (!chart.on().contains(day.getDayOfWeek())) {
            throw ApiProblem.badRequest("not_on_that_day", "This chart isn't on that day.");
        }
        EntryRow there = scene.between(TICK, day, day).stream()
                .filter(tick -> row.id().equals(tick.parentId())
                        && Objects.requireNonNullElse(tick.as(Tick.class).row(), 0) == index)
                .findFirst()
                .orElse(null);
        if (!sent.flag("done", true)) {
            if (there != null) {
                scene.remove(there.id());
            }
            return;
        }
        if (there != null) {
            return; // ticked already; ticking again is one tick
        }
        scene.add(
                EntryDraft.of(TICK)
                        .under(row.id())
                        .by(scene.myId())
                        .forMember(chart.people().size() == 1 ? chart.people().get(0) : null)
                        .day(day)
                        .position(scene.positionOn(day))
                        .done(scene.now(), scene.myId())
                        .amount(chart.earnsStars() ? 1L : 0L)
                        .doc(new Tick(index)),
                Scene.derivedId(row.id(), "tick " + index + " " + day));
    }

    // ---------- what it brings to the rest ----------

    @Override
    public String glance(Scene scene) {
        LocalDate monday = MealPlan.monday(scene.today());
        Map<UUID, List<EntryRow>> ticks = ticks(scene, monday);
        Map<UUID, Tally> stars = scene.tallies(TICK);
        List<HabitChartsChartResponse> today = charts(scene).stream()
                .map(chart -> chart(scene, chart, ticks.getOrDefault(chart.id(), List.of()), stars, monday))
                .filter(HabitChartsChartResponse::dueToday)
                .toList();
        long done = today.stream().filter(HabitChartsChartResponse::doneToday).count();
        return Words.count(charts(scene).size(), "chart") + " · " + done + " of " + today.size() + " done today";
    }
}
