package app.homeport.api.board.templates;

import app.homeport.api.board.BoardRules;
import app.homeport.api.board.BoardStore.Tally;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.home.TodaySource.TodayCard;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * A goal you walk together: the crew walks the distance from one place to another between them. Each person
 * types in what they walked, the way you'd add money to a savings goal, and the board adds it up.
 *
 * <p><b>Only a number.</b> What is kept for a walk is who typed it, the day, and one number: metres on a
 * board that counts kilometres, steps on a board that counts steps. Nothing is read from a phone's health
 * app, and no route, pace, heart rate or place is kept: there is nowhere to put one.
 *
 * <p>No map is served either. The board knows how far it is, how far the crew has come, and the places along
 * the way with how far along each lies; where to draw them is the app's business.
 *
 * <p>Everyone who sees the board sees how far each person walked this week and in all. A person adds,
 * changes and removes only their own walks, for today or one of the last 31 days. The week runs from Monday
 * to Sunday.
 */
@Component
class WalkTogether implements BoardRules {

    static final String WALK = "walk";
    static final String STOP = "stop";
    static final String KM = "km";
    static final String STEPS = "steps";
    /** The most one entry takes: 500 kilometres in metres, and as many steps. */
    private static final long MOST_AT_ONCE = 500_000;

    // ---------- what is stored ----------

    record WalkTogetherSettings(
            @Schema(nullable = true, description = "Where the walk starts: Ljubljana")
            String from,

            @Schema(nullable = true, description = "Where it ends: Lisbon")
            String to,

            @Schema(description = "How far it is: metres on a board in km, steps on a board in steps")
            long goal,

            @Schema(description = "km or steps") String unit) {}

    record Stop(String name) {}

    // ---------- the sums ----------

    /** How much of the way is behind them, 0 to 100, rounded down: 99 until the last step is walked. */
    static int percent(long total, long goal) {
        return goal <= 0 ? 0 : (int) Math.min(100, total * 100 / goal);
    }

    /** A total in the words of its unit: "1,240 km" for 1,240,000 metres; "84,000 steps". */
    static String words(long amount, String unit) {
        return unit.equals(STEPS) ? Say.number(amount) + " steps" : Say.number(Math.round(amount / 1000.0)) + " km";
    }

    // ---------- what a person sees ----------

    record WalkTogetherViewResponse(
            @Schema(nullable = true) String from,
            @Schema(nullable = true) String to,

            @Schema(description = "km or steps. On a board in km every amount is in metres.")
            String unit,

            long goal,

            @Schema(description = "What everyone has walked, added up")
            long total,

            @Schema(description = "How much of the way that is, 0 to 100")
            int percent,

            boolean reached,

            @Schema(description = "The Monday of this week") LocalDate weekStart,

            @Schema(description = "What everyone walked this week, added up")
            long thisWeek,

            @Schema(description = "Each person, the one who walked most this week first")
            List<WalkTogetherPersonResponse> people,

            @Schema(description = "Places along the way, in their order")
            List<WalkTogetherStopResponse> stops,

            @Schema(description = "The viewer's own walks of the last 31 days, newest first, to put a number right")
            List<WalkTogetherWalkResponse> yours) {}

    record WalkTogetherPersonResponse(PersonBrief person, boolean you, long thisWeek, long total) {}

    record WalkTogetherStopResponse(
            UUID id,
            String name,

            @Schema(description = "How far along the way it lies")
            long at,

            @Schema(description = "True once the crew has walked that far")
            boolean reached) {}

    record WalkTogetherWalkResponse(UUID id, LocalDate day, long amount) {}

    @Override
    public Template template() {
        return Template.WALK_TOGETHER;
    }

    @Override
    public Class<?> settingsType() {
        return WalkTogetherSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return WalkTogetherViewResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: from and to (the names of the two places), unit (km or steps; left out: km), goal (how far"
                        + " it is: metres for km, steps for steps)",
                "entry walk: amount (metres on a board in km, steps on a board in steps), day (left out: today)."
                        + " Your own walks only.",
                "entry stop: name, at (how far along the way, in the same unit as the goal)");
    }

    @Override
    public boolean viewersMayWrite(String kind) {
        return kind.equals(WALK);
    }

    @Override
    public Set<String> counted() {
        return Set.of(WALK);
    }

    @Override
    public int ceiling() {
        return 50000;
    }

    @Override
    public Object settings(Scene scene, Fields sent) {
        WalkTogetherSettings now = scene.isNew()
                ? new WalkTogetherSettings(null, null, 0, KM)
                : scene.settings(WalkTogetherSettings.class);
        String unit = sent.text("unit", 5, now.unit());
        if (unit == null || !(unit.equals(KM) || unit.equals(STEPS))) {
            throw ApiProblem.badRequest("invalid_unit", "Count kilometres or steps.");
        }
        if (!scene.isNew() && !unit.equals(now.unit()) && !scene.tallies(WALK).isEmpty()) {
            throw ApiProblem.conflict(
                    "walked_already", "Something is walked already. What is counted can't change now.");
        }
        Long goal = sent.whole("goal", 1, 100_000_000_000L, now.goal() == 0 ? null : now.goal());
        if (goal == null) {
            throw ApiProblem.badRequest("missing_goal", "Say how far it is.");
        }
        return new WalkTogetherSettings(sent.text("from", 60, now.from()), sent.text("to", 60, now.to()), goal, unit);
    }

    // ---------- reading ----------

    private static long total(Map<UUID, Tally> tallies) {
        return tallies.values().stream().mapToLong(Tally::sum).sum();
    }

    /** What each person walked in the week of the viewer's today. */
    private static Map<UUID, Long> thisWeek(Scene scene) {
        LocalDate monday = MealPlan.monday(scene.today());
        Map<UUID, Long> week = new HashMap<>();
        for (EntryRow walk : scene.between(WALK, monday, monday.plusDays(6))) {
            if (walk.forId() != null) {
                week.merge(walk.forId(), walk.amountOr(0), Long::sum);
            }
        }
        return week;
    }

    @Override
    public Object view(Scene scene, String show) {
        WalkTogetherSettings settings = scene.settings(WalkTogetherSettings.class);
        Map<UUID, Tally> tallies = scene.tallies(WALK);
        Map<UUID, Long> week = thisWeek(scene);
        long total = total(tallies);
        return new WalkTogetherViewResponse(
                settings.from(),
                settings.to(),
                settings.unit(),
                settings.goal(),
                total,
                percent(total, settings.goal()),
                total >= settings.goal(),
                MealPlan.monday(scene.today()),
                week.values().stream().mapToLong(Long::longValue).sum(),
                Say.voiceIds(scene).stream()
                        .map(id -> new WalkTogetherPersonResponse(
                                scene.brief(id),
                                scene.isMe(id),
                                week.getOrDefault(id, 0L),
                                tallies.getOrDefault(id, new Tally(0, 0)).sum()))
                        .sorted(Comparator.comparingLong(WalkTogetherPersonResponse::thisWeek)
                                .reversed())
                        .toList(),
                scene.entries(STOP).stream()
                        .sorted(Comparator.comparingLong(stop -> stop.amountOr(0)))
                        .map(stop -> new WalkTogetherStopResponse(
                                stop.id(), stop.as(Stop.class).name(), stop.amountOr(0), total >= stop.amountOr(0)))
                        .toList(),
                scene.myId() == null
                        ? List.of()
                        : scene.between(WALK, scene.today().minusDays(31), scene.today()).stream()
                                .filter(walk -> scene.isMe(walk.forId()))
                                .sorted(Comparator.comparing(EntryRow::day)
                                        .thenComparing(EntryRow::createdAt)
                                        .reversed())
                                .map(walk -> new WalkTogetherWalkResponse(walk.id(), walk.day(), walk.amountOr(0)))
                                .toList());
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        return entry.is(STOP) ? entry.as(Stop.class).name() : null;
    }

    // ---------- changing it ----------

    private static LocalDate day(Scene scene, Fields sent, LocalDate otherwise) {
        LocalDate day = sent.day("day", otherwise);
        if (day == null
                || day.isAfter(scene.today())
                || day.isBefore(scene.today().minusDays(31))) {
            throw ApiProblem.badRequest("invalid_day", "Choose today or one of the last 31 days.");
        }
        return day;
    }

    private static long amount(Fields sent, Long otherwise) {
        Long amount = sent.whole("amount", 1, MOST_AT_ONCE, otherwise);
        if (amount == null) {
            throw ApiProblem.badRequest("missing_amount", "Type how far you walked.");
        }
        return amount;
    }

    private static Stop stop(Fields sent, Stop now) {
        String name = sent.text("name", 60, now.name());
        if (name == null) {
            throw ApiProblem.badRequest("missing_name", "Give the place a name.");
        }
        return new Stop(name);
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        switch (kind) {
            case WALK -> {
                if (scene.myId() == null) {
                    throw BoardRules.notYours();
                }
                LocalDate day = day(scene, sent, scene.today());
                return scene.add(
                        EntryDraft.of(WALK)
                                .by(scene.myId())
                                .forMember(scene.myId())
                                .day(day)
                                .position(scene.positionOn(day))
                                .amount(amount(sent, null)),
                        clientId);
            }
            case STOP -> {
                scene.requireEdit();
                if (scene.entries(STOP).size() >= 30) {
                    throw ApiProblem.conflict("too_many", "Thirty places along the way is as many as it takes.");
                }
                Long at = sent.whole("at", 0, 100_000_000_000L);
                if (at == null) {
                    throw ApiProblem.badRequest("missing_at", "Say how far along the way it lies.");
                }
                return scene.add(
                        EntryDraft.of(STOP).by(scene.myId()).amount(at).doc(stop(sent, new Stop(null))), clientId);
            }
            default -> throw BoardRules.unknownKind();
        }
    }

    /** A walk is its walker's own. A place along the way is changed by anyone who may change the board. */
    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        if (entry.is(STOP)) {
            scene.requireEdit();
            scene.save(
                    entry,
                    EntryDraft.from(entry)
                            .amount(sent.whole("at", 0, 100_000_000_000L, entry.amount()))
                            .doc(stop(sent, entry.as(Stop.class))));
            return;
        }
        if (!scene.isMe(entry.forId())) {
            throw BoardRules.notYours();
        }
        LocalDate day = sent.has("day") ? day(scene, sent, entry.day()) : entry.day();
        scene.save(
                entry,
                EntryDraft.from(entry)
                        .day(day)
                        .position(day.equals(entry.day()) ? entry.position() : scene.positionOn(day))
                        .amount(amount(sent, entry.amount())));
    }

    @Override
    public void remove(Scene scene, EntryRow entry) {
        if (entry.is(STOP)) {
            scene.requireEdit();
        } else if (!scene.isMe(entry.forId())) {
            throw BoardRules.notYours();
        }
        scene.remove(entry.id());
    }

    // ---------- what it brings to the rest ----------

    @Override
    public String glance(Scene scene) {
        WalkTogetherSettings settings = scene.settings(WalkTogetherSettings.class);
        long total = total(scene.tallies(WALK));
        return Say.number(amountIn(total, settings.unit())) + " of " + words(settings.goal(), settings.unit()) + " · "
                + percent(total, settings.goal()) + "%";
    }

    private static long amountIn(long amount, String unit) {
        return unit.equals(STEPS) ? amount : Math.round(amount / 1000.0);
    }

    /** How far the crew has come, and what the viewer added this week. */
    @Override
    public List<TodayCard> cards(Scene scene) {
        if (scene.me() == null) {
            return List.of();
        }
        WalkTogetherSettings settings = scene.settings(WalkTogetherSettings.class);
        long total = total(scene.tallies(WALK));
        long mine = thisWeek(scene).getOrDefault(scene.myId(), 0L);
        boolean reached = total >= settings.goal();
        if (reached && thisWeek(scene).isEmpty()) {
            return List.of(); // they arrived, and it has been said
        }
        return List.of(new TodayCard(
                scene.boardId(),
                ThingKind.BOARD,
                template().code(),
                template().emoji(),
                scene.title(),
                reached
                        ? "You made it" + (settings.to() == null ? "" : " to " + settings.to()) + ": "
                                + words(settings.goal(), settings.unit())
                        : Say.number(amountIn(total, settings.unit())) + " of "
                                + words(settings.goal(), settings.unit()) + " · "
                                + (mine == 0
                                        ? "nothing from you yet this week"
                                        : "you added " + Say.number(amountIn(mine, settings.unit())) + " this week"),
                percent(total, settings.goal()) + "%",
                null,
                null,
                30));
    }

    @Override
    public String guest(Scene scene) {
        return glance(scene);
    }
}
