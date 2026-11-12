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
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
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
 * Whose turn?: who chooses the film, who has the front seat, who goes first. It remembers who had the last
 * turn, and moves on when a turn is taken.
 *
 * <p><b>The rule.</b> Each thing people take turns at has its people in a fixed order. Whose turn it is next
 * is the person after whoever had it last, round and round. A turn is written down with its day (and a few
 * words, if someone wants: "Frozen, again"), and it is kept: that is the proof for the next argument. A turn
 * can be written down for someone other than the one whose turn it was (they swapped, or one of them simply
 * did it twice); the turn then moves on from them.
 *
 * <p>In a family only the grown-ups write down what happened; everyone who sees the list can read it. Nothing
 * here is secret.
 */
@Component
class WhoseTurn implements BoardRules {

    static final String THING = "thing";
    static final String TURN = "turn";
    private static final int MAX_THINGS = 40;
    /** How far back turns are read to say who had it last. Older turns are kept and counted. */
    private static final int RECENT_DAYS = 60;

    record WhoseTurnSettings() {}

    /**
     * Something people take turns at. The entry's own columns hold the rest: {@code for_id} is whose turn it is
     * next, {@code day} the day it is next on.
     *
     * @param does what the one whose turn it is does: "chooses the film"
     * @param did the same in the past, for the line about last time: "chose"
     * @param when when it comes round, in the family's words: "Every evening"
     */
    record Thing(String name, String emoji, String does, String did, String when, List<UUID> people) {
        Thing {
            people = people == null ? List.of() : List.copyOf(people);
        }
    }

    record Turn(String note) {}

    record WhoseTurnResponse(
            @Schema(description = "What people take turns at, in the list's order. Forty at most.")
            List<WhoseTurnThingResponse> things,

            @Schema(description = "How many turns were kept, ever")
            int turns,

            @Schema(description = "The day the list was started: turns are kept since then")
            LocalDate since,

            @Schema(description = "True when this person may write down what happened: in a family, the grown-ups")
            boolean canChange,

            @Schema(description = "The first day of the stretch whose turns are in `history`")
            LocalDate historyFrom,

            LocalDate historyTo,

            @Schema(description = "The turns of that stretch, newest first, each with its date")
            List<WhoseTurnTurnResponse> history) {}

    record WhoseTurnThingResponse(
            UUID id,
            String name,
            @Schema(nullable = true) String emoji,

            @Schema(nullable = true, description = "What the one whose turn it is does: chooses the film")
            String does,

            @Schema(nullable = true, description = "When it comes round, in the family's words: Every evening")
            String when,

            @Schema(nullable = true, description = "The day it is next on, when someone set one")
            LocalDate onDay,

            @Schema(description = "True when it is on today: Tonight is film night")
            boolean tonight,

            @Schema(nullable = true, description = "Whose turn it is")
            PersonBrief next,

            @Schema(description = "True when it is the turn of the person looking, or of a child they look after")
            boolean yourTurn,

            @Schema(description = "The people who take turns at it, in their order")
            List<PersonBrief> people,

            @Schema(nullable = true, description = "The last turn that was taken")
            WhoseTurnTurnResponse last,

            @Schema(
                    nullable = true,
                    description = "The small line under it: Mia chose last Friday. Frozen, again. Null when there is"
                            + " nothing to say yet.")
            String line) {}

    record WhoseTurnTurnResponse(
            UUID id,
            UUID thingId,
            String thing,
            @Schema(nullable = true) PersonBrief who,

            @Schema(description = "True when it was the turn of the person looking")
            boolean you,

            LocalDate day,

            @Schema(nullable = true, description = "A few words someone added: Frozen, again")
            String note) {}

    @Override
    public Template template() {
        return Template.WHOSE_TURN;
    }

    @Override
    public Class<?> settingsType() {
        return WhoseTurnSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return WhoseTurnResponse.class;
    }

    @Override
    public Class<?> entryType() {
        return WhoseTurnThingResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: none",
                "entry thing: name, emoji, does (words: chooses the film), did (the same in the past: chose), when"
                        + " (words: Every evening), people (member ids in their order; left out: everyone),"
                        + " nextMemberId (whose turn it is; left out: the first), onDay (the day it is next on, or"
                        + " null)",
                "entry turn: thingId, memberId (who took it; left out: whoever's turn it was), note, day (left out:"
                        + " today). Adding one is “Done, pass it on”; removing it takes the turn back.",
                "show: a month as 2026-11, for the turns kept in it (`history`). Left out: the last 31 days.");
    }

    @Override
    public Set<String> counted() {
        return Set.of(TURN);
    }

    @Override
    public int ceiling() {
        return 20000;
    }

    // ---------- the rule ----------

    /** Who comes after someone in a thing's order. The first, when that someone isn't one of them. Null for nobody. */
    static <T> T after(List<T> people, T who) {
        if (people.isEmpty()) {
            return null;
        }
        return people.get((people.indexOf(who) + 1) % people.size());
    }

    /**
     * The small line under a thing. In this order: the days of a run of turns the same person took one after
     * the other; what was written down at the last turn; when it comes round; who had it last.
     *
     * @param who the first name of whoever had the last turn, or "You"; null when no turn was taken yet
     * @param run the days of the turns that person took in a row, oldest first (one day when it was one turn)
     */
    static String line(String who, String did, List<LocalDate> run, String note, String when, LocalDate today) {
        if (who == null || run.isEmpty()) {
            return when;
        }
        LocalDate last = run.get(run.size() - 1);
        boolean thisWeek = run.stream().allMatch(day -> !day.isBefore(today.minusDays(6)));
        if (run.size() >= 2 && thisWeek && run.stream().distinct().count() == run.size()) {
            return who + " did "
                    + Phrases.list(run.stream().map(Phrases::weekday).toList());
        }
        if (note != null && did != null) {
            return who + " " + did + " " + Phrases.ago(last, today) + ". " + note + (note.endsWith(".") ? "" : ".");
        }
        if (note != null) {
            return who + " " + note;
        }
        return when != null ? when : who + " had the last turn, " + Phrases.ago(last, today);
    }

    /** The people of a thing who are still in the circle, in the thing's order. */
    private static List<UUID> people(Scene scene, Thing thing) {
        return thing.people().stream()
                .filter(id -> scene.person(id) != null && !scene.person(id).left())
                .toList();
    }

    /** The turns of the last weeks, by thing, each thing's oldest first. */
    private static Map<UUID, List<EntryRow>> recent(Scene scene) {
        return scene
                .between(
                        TURN,
                        scene.today().minusDays(RECENT_DAYS),
                        scene.today().plusDays(1))
                .stream()
                .filter(t -> t.parentId() != null)
                .sorted(Comparator.comparing(EntryRow::day).thenComparing(EntryRow::createdAt))
                .collect(Collectors.groupingBy(EntryRow::parentId));
    }

    // ---------- settings ----------

    @Override
    public Object settings(Scene scene, Fields sent) {
        return new WhoseTurnSettings();
    }

    // ---------- what a person sees ----------

    @Override
    public Object view(Scene scene, String show) {
        LocalDate from = scene.today().minusDays(30);
        LocalDate to = scene.today();
        if (show != null) {
            try {
                YearMonth month = YearMonth.parse(show);
                from = month.atDay(1);
                to = month.atEndOfMonth();
            } catch (RuntimeException notAMonth) {
                throw ApiProblem.badRequest("invalid_show", "Choose a month, like 2026-11.");
            }
        }
        Map<UUID, List<EntryRow>> recent = recent(scene);
        Map<UUID, EntryRow> things =
                scene.entries(THING).stream().collect(Collectors.toMap(EntryRow::id, thing -> thing));
        return new WhoseTurnResponse(
                scene.entries(THING).stream()
                        .map(thing -> thing(scene, thing, recent.getOrDefault(thing.id(), List.of())))
                        .toList(),
                scene.tallies(TURN).values().stream().mapToInt(Tally::count).sum(),
                scene.createdAt().atOffset(ZoneOffset.UTC).toLocalDate(),
                scene.canEdit() && scene.iRunTheCircle(),
                from,
                to,
                scene.between(TURN, from, to).stream()
                        .filter(turn -> things.containsKey(turn.parentId()))
                        .sorted(Comparator.comparing(EntryRow::day)
                                .thenComparing(EntryRow::createdAt)
                                .reversed())
                        .map(turn -> turn(scene, things.get(turn.parentId()), turn))
                        .toList());
    }

    private static WhoseTurnThingResponse thing(Scene scene, EntryRow row, List<EntryRow> turns) {
        Thing thing = row.as(Thing.class);
        EntryRow last = turns.isEmpty() ? null : turns.get(turns.size() - 1);
        List<LocalDate> run = new ArrayList<>();
        for (int i = turns.size() - 1; i >= 0 && Objects.equals(turns.get(i).forId(), last.forId()); i--) {
            run.add(0, turns.get(i).day());
        }
        String who = last == null ? null : scene.isMe(last.forId()) ? "You" : scene.firstName(last.forId());
        return new WhoseTurnThingResponse(
                row.id(),
                thing.name(),
                thing.emoji(),
                thing.does(),
                thing.when(),
                row.day(),
                scene.today().equals(row.day()),
                scene.brief(row.forId()),
                row.forId() != null && scene.iStandInFor(row.forId()),
                people(scene, thing).stream().map(scene::brief).toList(),
                last == null ? null : turn(scene, row, last),
                line(
                        who,
                        thing.did(),
                        run,
                        last == null ? null : last.as(Turn.class).note(),
                        thing.when(),
                        scene.today()));
    }

    private static WhoseTurnTurnResponse turn(Scene scene, EntryRow thing, EntryRow turn) {
        return new WhoseTurnTurnResponse(
                turn.id(),
                thing.id(),
                thing.as(Thing.class).name(),
                scene.brief(turn.forId()),
                scene.isMe(turn.forId()),
                turn.day(),
                turn.as(Turn.class).note());
    }

    @Override
    public Object entry(Scene scene, EntryRow entry) {
        return entry.is(THING) ? thing(scene, entry, recent(scene).getOrDefault(entry.id(), List.of())) : null;
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        if (entry.is(THING)) {
            Thing thing = entry.as(Thing.class);
            return thing.name() + (thing.when() == null ? "" : " · " + thing.when());
        }
        return entry.is(TURN) ? entry.as(Turn.class).note() : null;
    }

    // ---------- changing it ----------

    private static void grownUps(Scene scene) {
        Phrases.requireGrownUp(scene, "Only the grown-ups can change what happened.");
    }

    private static List<UUID> turnTakers(Scene scene, List<UUID> sent, List<UUID> now) {
        List<UUID> people = sent != null ? sent : now;
        if (people.isEmpty()) {
            people = scene.humans().stream().map(Person::id).toList();
        }
        for (UUID id : people) {
            scene.inCircle(id);
            if (scene.person(id).kind() == MemberKind.PET) {
                throw ApiProblem.badRequest("not_a_person", "A pet can't take a turn.");
            }
        }
        return people;
    }

    private static Thing thing(Scene scene, Fields sent, Thing now) {
        String name = sent.text("name", 80, now.name());
        if (name == null) {
            throw ApiProblem.badRequest("missing_name", "Say what you take turns at.");
        }
        return new Thing(
                name,
                sent.text("emoji", 16, now.emoji()),
                sent.text("does", 80, now.does()),
                sent.text("did", 40, now.did()),
                sent.text("when", 80, now.when()),
                turnTakers(scene, sent.ids("people", 30), now.people()));
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        grownUps(scene);
        return switch (kind) {
            case THING -> {
                if (scene.entries(THING).size() >= MAX_THINGS) {
                    throw ApiProblem.conflict("too_many", "Forty things is as many as one list keeps count of.");
                }
                Thing thing = thing(scene, sent, new Thing(null, null, null, null, null, List.of()));
                UUID next = sent.id("nextMemberId", thing.people().get(0));
                if (!thing.people().contains(next)) {
                    throw ApiProblem.badRequest("not_taking_turns", "Choose one of the people who take turns at it.");
                }
                yield scene.add(
                        EntryDraft.of(THING)
                                .by(scene.myId())
                                .forMember(next)
                                .day(sent.day("onDay"))
                                .doc(thing),
                        clientId);
            }
            case TURN -> {
                EntryRow thing = scene.need(sent.id("thingId"));
                if (!thing.is(THING)) {
                    throw Scene.entryGone();
                }
                UUID who = scene.inCircle(sent.id("memberId", thing.forId()));
                if (who == null) {
                    throw ApiProblem.badRequest("missing_member", "Say who took the turn.");
                }
                LocalDate day = sent.day("day", scene.today());
                if (day == null
                        || day.isAfter(scene.today())
                        || day.isBefore(scene.today().minusDays(31))) {
                    throw ApiProblem.badRequest(
                            "invalid_day", "A turn can be written down for today or one of the last few weeks.");
                }
                UUID id = scene.add(
                        EntryDraft.of(TURN)
                                .under(thing.id())
                                .by(scene.myId())
                                .forMember(who)
                                .day(day)
                                .position(scene.positionOn(day))
                                .doc(new Turn(sent.text("note", 200))),
                        clientId);
                // The day it was on has been and gone; the turn moves on from whoever had it last.
                passOn(scene, thing, null, thing.day() != null && !thing.day().isAfter(day));
                yield id;
            }
            default -> throw BoardRules.unknownKind();
        };
    }

    /**
     * Sets whose turn a thing is from the turns that were taken: the one after whoever had it last. When no
     * turn of the last weeks is left, it is the turn of {@code otherwise} (the one whose turn was just taken
     * back), or stays as it is.
     */
    private static void passOn(Scene scene, EntryRow thing, UUID otherwise, boolean clearDay) {
        List<EntryRow> turns = recent(scene).getOrDefault(thing.id(), List.of());
        List<UUID> people = people(scene, thing.as(Thing.class));
        UUID next = turns.isEmpty()
                ? (otherwise != null ? otherwise : thing.forId())
                : after(people, turns.get(turns.size() - 1).forId());
        scene.save(thing, EntryDraft.from(thing).forMember(next).day(clearDay ? null : thing.day()));
    }

    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        grownUps(scene);
        if (entry.is(TURN)) {
            scene.save(
                    entry,
                    EntryDraft.from(entry)
                            .doc(new Turn(
                                    sent.text("note", 200, entry.as(Turn.class).note()))));
            return;
        }
        Thing thing = thing(scene, sent, entry.as(Thing.class));
        UUID next = sent.id("nextMemberId", entry.forId());
        if (next == null || !thing.people().contains(next)) {
            next = thing.people().get(0);
        }
        scene.save(
                entry,
                EntryDraft.from(entry)
                        .forMember(next)
                        .day(sent.day("onDay", entry.day()))
                        .doc(thing));
    }

    /** Taking a turn back gives it to whoever had it before; removing a thing removes its turns with it. */
    @Override
    public void remove(Scene scene, EntryRow entry) {
        grownUps(scene);
        scene.remove(entry.id());
        if (entry.is(TURN) && entry.parentId() != null) {
            passOn(scene, scene.entry(entry.parentId()), entry.forId(), false);
        }
    }

    // ---------- what it brings to the rest ----------

    @Override
    public String glance(Scene scene) {
        List<EntryRow> things = scene.entries(THING);
        EntryRow tonight = things.stream()
                .filter(thing -> scene.today().equals(thing.day()))
                .findFirst()
                .orElse(null);
        if (tonight != null && tonight.forId() != null) {
            Thing thing = tonight.as(Thing.class);
            String who = scene.firstName(tonight.forId());
            return "Tonight: "
                    + (thing.does() == null ? thing.name() + ", " + Words.of(who) + " turn" : who + " " + thing.does());
        }
        int turns = scene.tallies(TURN).values().stream().mapToInt(Tally::count).sum();
        return Words.count(things.size(), "thing") + " · " + Words.count(turns, "turn") + " kept";
    }
}
