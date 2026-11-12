package app.homeport.api.board.templates;

import app.homeport.api.board.BoardMedia;
import app.homeport.api.board.BoardRules;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Person;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.board.Words;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.circle.MemberStatus;
import app.homeport.api.circle.Role;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.media.MediaKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.IsoFields;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Secret missions: every week each person has one small secret kindness to do for someone else in the circle.
 *
 * <p><b>Who has whom.</b> Each Monday starts a new week. For that week everyone in the circle (pets too) is
 * put in a circle of their own, in an order drawn from the board and the week, and each person's mission is
 * for the one standing next to them: nobody has themselves, and nobody is the target of two. A pet can be
 * given a kindness but has none to do. Nothing is stored for this: {@link #pairs} gives the same answer
 * every time it is asked. A mission is written down when something happens to it: it was done, or its
 * person asked for a different one.
 *
 * <p><b>Who sees what.</b> It is decided in {@link #sight}, and only there:
 *
 * <ul>
 *   <li>During the week a mission is shown to the person whose mission it is, and to nobody else: not to the
 *       one it is for, and not to anyone looking on. A child without a sign-in is read theirs by a grown-up
 *       who looks after them, never by the grown-up it is for. (When the only grown-up who could read it is
 *       the one it is for, the week is drawn again; when no draw helps, that child has no mission that week.)
 *   <li>From the Sunday that ends its week, a mission that was done is shown to everyone who sees the board:
 *       who did what for whom. A mission that was never done is never shown to anyone else.
 * </ul>
 *
 * Before that Sunday nothing about another person's mission leaves the API: not its words, not who it is
 * for, not whether it was done. The day is the viewer's own day, but never more than a day from the API's
 * (see {@code Today}).
 */
@Component
class SecretMissions implements BoardRules {

    static final String MISSION = "mission";

    /** Each takes the name of the one it is for, and that name with its 's: "Mia", "Mia's". */
    static final List<String> KINDNESSES = List.of(
            "Do one of %2$s jobs before anyone notices.",
            "Leave a note where only %1$s will find it.",
            "Make %2$s favourite snack, and don't say why.",
            "Say one thing %1$s did well this week, out loud.",
            "Let %1$s choose, for a whole evening.",
            "Tidy something of %2$s without being asked.",
            "Give up the best seat for %1$s, all week.",
            "Carry something for %1$s before being asked.",
            "Put %2$s favourite song on at breakfast.",
            "Ask %1$s about the day, and only listen.",
            "Hide a small drawing where %1$s will look tomorrow.",
            "Save the last one of something for %1$s.",
            "Bring %1$s a drink nobody asked for.",
            "Find something %1$s lost, or thought was lost.");

    static final List<String> FOR_A_PET = List.of(
            "Take %1$s on one very long walk.",
            "Give %1$s ten minutes of scratches behind the ears.",
            "Teach %1$s one small trick, with patience.",
            "Brush %1$s until the coat shines.");

    record SecretMissionsSettings() {}

    /**
     * A mission that something has happened to. The entry's columns hold the rest: {@code author_id} is whose
     * mission it is, {@code for_id} who it is for, {@code day} the Monday of its week, {@code done_at} when it
     * was done, {@code media_id} a photo of it.
     *
     * @param did what they did, in their own words, for the day it is revealed
     * @param reply a line someone added after it was revealed: "You guessed by Wednesday"
     * @param picks how many times a different one was asked for
     */
    record Mission(String text, String did, String reply, Integer picks, Boolean liked) {}

    /** What one person may know of one mission. */
    enum Sight {
        /** It isn't there for them. */
        NOTHING,
        /** It is theirs to do (or their child's, to read to them). */
        YOURS,
        /** Its week is over and it was done: everyone reads it. */
        REVEALED
    }

    record SecretMissionsResponse(
            @Schema(description = "The number of this week, as calendars count it")
            int week,

            LocalDate weekStart,

            @Schema(description = "The Sunday this week's missions are revealed on")
            LocalDate revealsOn,

            @Schema(description = "How many people have a mission this week")
            int people,

            @Schema(
                    description = "This week's missions that are this person's to do: their own first, then those of"
                            + " the children they read them to. Nobody else's is ever in here.")
            List<SecretMissionsMissionResponse> yours,

            @Schema(nullable = true, description = "The Monday of the week whose missions are in `revealed`")
            LocalDate revealedWeekStart,

            @Schema(description = "What was done in that week, for everyone to read")
            List<SecretMissionsMissionResponse> revealed) {}

    record SecretMissionsMissionResponse(
            @Schema(
                    nullable = true,
                    description = "Null until something happened to it: it is then named by its person")
            UUID id,

            LocalDate weekStart,

            @Schema(nullable = true, description = "Whose mission it is")
            PersonBrief doer,

            @Schema(description = "True when it is the mission of the person looking")
            boolean yours,

            @Schema(nullable = true, description = "Who it is for")
            PersonBrief target,

            @Schema(description = "True when it was for the person looking")
            boolean forYou,

            String text,

            @Schema(nullable = true, description = "What they did, in their own words")
            String did,

            boolean done,
            @Schema(nullable = true) Instant doneAt,

            @Schema(description = "True once everyone may read it")
            boolean revealed,

            @Schema(nullable = true, description = "A line added after it was revealed: You guessed by Wednesday")
            String reply,

            @Schema(description = "True when the one it was for gave it a heart")
            boolean liked,

            @Schema(nullable = true) BoardMedia photo) {}

    @Override
    public Template template() {
        return Template.SECRET_MISSIONS;
    }

    @Override
    public Class<?> settingsType() {
        return SecretMissionsSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return SecretMissionsResponse.class;
    }

    @Override
    public Class<?> entryType() {
        return SecretMissionsMissionResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: none",
                "verb done: memberId (whose mission; left out: yours), did (what you did, in your words), mediaId (a"
                        + " photo upload), done (false takes the tick back, until it is revealed)",
                "verb another: memberId (left out: you). Gives a different mission for the same person.",
                "verb like: entryId, liked (left out: true). For the one a revealed mission was for.",
                "verb reply: entryId, text. A line under a revealed mission, from the one it was for or the one who did it.",
                "Changing an entry: text (your own words for your mission) or did, until it is revealed.",
                "show: any day of a week, as a date, for what was revealed in it. Left out: the last week revealed.",
                "Everyone who sees the board may use these verbs, also with a board they may only look at.");
    }

    @Override
    public boolean viewersMay(String verb) {
        return Set.of("done", "another", "like", "reply").contains(verb);
    }

    @Override
    public boolean viewersMayWrite(String kind) {
        return kind.equals(MISSION);
    }

    @Override
    public int ceiling() {
        return 10000;
    }

    // ---------- who has whom ----------

    /**
     * Who has whom in one week: each person who does a mission, with the one it is for.
     *
     * @param everyone everybody who can be given a kindness, pets too
     * @param doers those of them who have a mission to do
     * @param noSignIn those of the doers who are read their mission by someone else
     * @param readers the people who read a mission to someone without a sign-in
     * @param seed draws the order: the same seed gives the same week
     */
    static Map<UUID, UUID> pairs(
            List<UUID> everyone, List<UUID> doers, Set<UUID> noSignIn, Set<UUID> readers, long seed) {
        Map<UUID, UUID> pairs = new LinkedHashMap<>();
        if (everyone.size() < 2) {
            return pairs;
        }
        for (int attempt = 0; attempt < 20; attempt++) {
            List<UUID> ring = new ArrayList<>(everyone);
            Collections.shuffle(ring, new Random(seed + attempt));
            pairs.clear();
            for (UUID doer : doers) {
                pairs.put(doer, ring.get((ring.indexOf(doer) + 1) % ring.size()));
            }
            if (pairs.entrySet().stream().allMatch(pair -> readable(pair, noSignIn, readers))) {
                return pairs;
            }
        }
        // No order works (one grown-up and one child): whoever can't be read theirs has none this week.
        pairs.entrySet().removeIf(pair -> !readable(pair, noSignIn, readers));
        return pairs;
    }

    /** True when someone other than its target can read this mission to the person whose it is. */
    private static boolean readable(Map.Entry<UUID, UUID> pair, Set<UUID> noSignIn, Set<UUID> readers) {
        return !noSignIn.contains(pair.getKey())
                || readers.stream().anyMatch(reader -> !reader.equals(pair.getValue()));
    }

    /** The mission suggested for a person: the same one every time, and the next one each time they ask for another. */
    static String suggestion(String targetName, boolean pet, long seed, int picks) {
        List<String> from = pet ? FOR_A_PET : KINDNESSES;
        String words = from.get((int) Math.floorMod(seed + picks, (long) from.size()));
        return words.formatted(targetName, Words.of(targetName));
    }

    private static long seed(Scene scene, LocalDate week, UUID doer) {
        return UUID.nameUUIDFromBytes((scene.boardId() + " " + week + (doer == null ? "" : " " + doer))
                        .getBytes(StandardCharsets.UTF_8))
                .getMostSignificantBits();
    }

    private static boolean takesPart(Person person) {
        return !person.left() && person.role() != Role.GUEST;
    }

    /** One mission of a week: stored when something happened to it, worked out otherwise. */
    private record Dealt(UUID doer, UUID target, LocalDate week, String text, EntryRow row) {
        boolean done() {
            return row != null && row.done();
        }
    }

    /** Every mission of a week, by the person whose it is, in the circle's order. */
    private static Map<UUID, Dealt> dealt(Scene scene, LocalDate week) {
        List<Person> everyone =
                scene.members().stream().filter(SecretMissions::takesPart).toList();
        List<UUID> doers = everyone.stream()
                .filter(person -> person.kind() != MemberKind.PET)
                .map(Person::id)
                .toList();
        Map<UUID, UUID> pairs = pairs(
                everyone.stream().map(Person::id).toList(),
                doers,
                everyone.stream().filter(Person::hasNoSignIn).map(Person::id).collect(Collectors.toSet()),
                everyone.stream()
                        .filter(person -> !person.hasNoSignIn()
                                && person.status() == MemberStatus.JOINED
                                && (!scene.circleKind().hasRoles() || person.grownUp()))
                        .map(Person::id)
                        .collect(Collectors.toSet()),
                seed(scene, week, null));
        Map<UUID, EntryRow> stored = scene.entries(MISSION).stream()
                .filter(row -> week.equals(row.day()) && row.authorId() != null)
                .collect(Collectors.toMap(EntryRow::authorId, row -> row, (first, second) -> first));
        Map<UUID, Dealt> dealt = new LinkedHashMap<>();
        for (UUID doer : doers) {
            EntryRow row = stored.get(doer);
            if (row != null) {
                dealt.put(
                        doer,
                        new Dealt(doer, row.forId(), week, row.as(Mission.class).text(), row));
            } else if (pairs.containsKey(doer)) {
                Person target = scene.person(pairs.get(doer));
                dealt.put(
                        doer,
                        new Dealt(
                                doer,
                                target.id(),
                                week,
                                suggestion(
                                        scene.firstName(target.id()),
                                        target.kind() == MemberKind.PET,
                                        seed(scene, week, doer),
                                        0),
                                null));
            }
        }
        return dealt;
    }

    // ---------- who sees what ----------

    /** True from the Sunday that ends a week. */
    static boolean revealed(LocalDate week, LocalDate today) {
        return !today.isBefore(week.plusDays(6));
    }

    /** True when this mission is the viewer's to do, or their child's to be read to them. Never for its target. */
    private static boolean mayDo(Scene scene, UUID doer, UUID target) {
        if (scene.me() == null || doer == null) {
            return false;
        }
        return scene.isMe(doer) || (!scene.isMe(target) && scene.person(doer).hasNoSignIn() && scene.iStandInFor(doer));
    }

    /** The one place that decides what a person may know of a mission. */
    private static Sight sight(Scene scene, UUID doer, UUID target, LocalDate week, boolean done) {
        if (done && revealed(week, scene.today())) {
            return Sight.REVEALED;
        }
        return mayDo(scene, doer, target) ? Sight.YOURS : Sight.NOTHING;
    }

    private static Sight sight(Scene scene, EntryRow row) {
        return row.day() == null ? Sight.NOTHING : sight(scene, row.authorId(), row.forId(), row.day(), row.done());
    }

    // ---------- settings ----------

    @Override
    public Object settings(Scene scene, Fields sent) {
        return new SecretMissionsSettings();
    }

    // ---------- what a person sees ----------

    @Override
    public Object view(Scene scene, String show) {
        LocalDate week = MealPlan.monday(scene.today());
        Map<UUID, Dealt> thisWeek = dealt(scene, week);
        LocalDate shown = revealed(week, scene.today()) ? week : week.minusDays(7);
        if (show != null) {
            try {
                shown = MealPlan.monday(LocalDate.parse(show));
            } catch (RuntimeException notADay) {
                throw ApiProblem.badRequest("invalid_show", "Choose a week by one of its days.");
            }
        }
        LocalDate of = shown;
        return new SecretMissionsResponse(
                week.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR),
                week,
                week.plusDays(6),
                thisWeek.size(),
                thisWeek.values().stream()
                        .filter(mission -> mayDo(scene, mission.doer(), mission.target()))
                        .sorted(Comparator.comparing(mission -> !scene.isMe(mission.doer())))
                        .map(mission -> mission(scene, mission))
                        .toList(),
                revealed(of, scene.today()) ? of : null,
                scene.entries(MISSION).stream()
                        .filter(row -> of.equals(row.day()) && sight(scene, row) == Sight.REVEALED)
                        .map(row -> mission(scene, of(row)))
                        .toList());
    }

    private static Dealt of(EntryRow row) {
        return new Dealt(
                row.authorId(), row.forId(), row.day(), row.as(Mission.class).text(), row);
    }

    /** A mission for someone who may know of it: the caller asked {@link #sight} first. */
    private static SecretMissionsMissionResponse mission(Scene scene, Dealt mission) {
        EntryRow row = mission.row();
        Mission stored = row == null ? new Mission(null, null, null, null, null) : row.as(Mission.class);
        boolean open = mission.done() && revealed(mission.week(), scene.today());
        return new SecretMissionsMissionResponse(
                row == null ? null : row.id(),
                mission.week(),
                scene.brief(mission.doer()),
                scene.isMe(mission.doer()),
                scene.brief(mission.target()),
                scene.isMe(mission.target()),
                mission.text(),
                stored.did(),
                mission.done(),
                row == null ? null : row.doneAt(),
                open,
                open ? stored.reply() : null,
                open && Boolean.TRUE.equals(stored.liked()),
                row == null ? null : scene.media(row.mediaId()));
    }

    @Override
    public Object entry(Scene scene, EntryRow entry) {
        return entry.is(MISSION) && sight(scene, entry) != Sight.NOTHING ? mission(scene, of(entry)) : null;
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        Sight sight = entry.is(MISSION) ? sight(scene, entry) : Sight.NOTHING;
        if (sight == Sight.NOTHING) {
            return null;
        }
        Mission mission = entry.as(Mission.class);
        return mission.text()
                + (mission.did() == null ? "" : " · " + mission.did())
                + (sight == Sight.REVEALED && mission.reply() != null ? " · " + mission.reply() : "");
    }

    // ---------- changing it ----------

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        throw ApiProblem.conflict("dealt_weekly", "Missions come by themselves, one each, every Monday.");
    }

    private static ApiProblem alreadyRevealed() {
        return ApiProblem.conflict("revealed", "It has been revealed. It stays as it is now.");
    }

    /** Its person rewrites a mission in their own words, or says what they did, until it is revealed. */
    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        if (!entry.is(MISSION) || !mayDo(scene, entry.authorId(), entry.forId())) {
            throw Scene.entryGone(); // someone else's mission isn't there for this person
        }
        if (sight(scene, entry) == Sight.REVEALED) {
            throw alreadyRevealed();
        }
        Mission now = entry.as(Mission.class);
        String text = sent.text("text", 300, now.text());
        scene.save(
                entry,
                EntryDraft.from(entry)
                        .doc(new Mission(
                                text == null ? now.text() : text,
                                sent.text("did", 300, now.did()),
                                now.reply(),
                                now.picks(),
                                now.liked())));
    }

    @Override
    public void remove(Scene scene, EntryRow entry) {
        if (sight(scene, entry) == Sight.NOTHING) {
            throw Scene.entryGone();
        }
        throw ApiProblem.conflict("kept", "A mission can't be removed. Ask for a different one instead.");
    }

    /** This week's mission of the viewer, or of the child they named, for someone who may do it. */
    private static Dealt mine(Scene scene, Fields sent) {
        UUID doer = sent.id("memberId", scene.myId());
        Dealt mission = doer == null
                ? null
                : dealt(scene, MealPlan.monday(scene.today())).get(doer);
        if (mission == null || !mayDo(scene, mission.doer(), mission.target())) {
            throw new ApiProblem(HttpStatus.NOT_FOUND, "no_mission", "There is no mission there for you this week.");
        }
        return mission;
    }

    /** Writes a mission down, or changes what is written, and keeps it the one mission of its person that week. */
    private static void keep(Scene scene, Dealt mission, EntryDraft draft) {
        if (mission.row() != null) {
            scene.save(mission.row(), draft);
        } else {
            scene.add(draft, Scene.derivedId(scene.boardId(), "mission " + mission.week() + " " + mission.doer()));
        }
    }

    private static EntryDraft draft(Dealt mission) {
        return mission.row() != null
                ? EntryDraft.from(mission.row())
                : EntryDraft.of(MISSION)
                        .by(mission.doer())
                        .forMember(mission.target())
                        .day(mission.week())
                        .position(mission.week().toEpochDay())
                        .doc(new Mission(mission.text(), null, null, 0, null));
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        switch (verb) {
            case "done" -> {
                Dealt mission = mine(scene, sent);
                Mission now = mission.row() == null
                        ? new Mission(mission.text(), null, null, 0, null)
                        : mission.row().as(Mission.class);
                boolean done = sent.flag("done", true);
                if (!done && mission.done() && revealed(mission.week(), scene.today())) {
                    throw alreadyRevealed();
                }
                EntryDraft draft = draft(mission)
                        .done(
                                done ? (mission.done() ? mission.row().doneAt() : scene.now()) : null,
                                done ? scene.myId() : null)
                        .doc(new Mission(
                                now.text(), sent.text("did", 300, now.did()), now.reply(), now.picks(), now.liked()));
                if (sent.has("mediaId")) {
                    draft.media(scene.upload(sent.id("mediaId"), MediaKind.PHOTO));
                }
                keep(scene, mission, draft);
            }
            case "another" -> {
                Dealt mission = mine(scene, sent);
                if (mission.done()) {
                    throw ApiProblem.conflict("done", "This one is done. A new one comes on Monday.");
                }
                Mission now = mission.row() == null
                        ? new Mission(mission.text(), null, null, 0, null)
                        : mission.row().as(Mission.class);
                int picks = (now.picks() == null ? 0 : now.picks()) + 1;
                Person target = scene.person(mission.target());
                String text = target == null
                        ? now.text()
                        : suggestion(
                                scene.firstName(target.id()),
                                target.kind() == MemberKind.PET,
                                seed(scene, mission.week(), mission.doer()),
                                picks);
                keep(scene, mission, draft(mission).doc(new Mission(text, null, null, picks, null)));
            }
            case "like", "reply" -> {
                EntryRow row = scene.need(sent.id("entryId"));
                if (!row.is(MISSION) || sight(scene, row) != Sight.REVEALED) {
                    throw Scene.entryGone(); // not revealed: for anyone but its person it isn't there
                }
                Mission now = row.as(Mission.class);
                boolean target = row.forId() != null && scene.iStandInFor(row.forId());
                if (verb.equals("like")) {
                    if (!target) {
                        throw new ApiProblem(
                                HttpStatus.FORBIDDEN, "not_for_you", "The heart is for the one it was done for.");
                    }
                    scene.save(
                            row,
                            EntryDraft.from(row)
                                    .doc(new Mission(
                                            now.text(),
                                            now.did(),
                                            now.reply(),
                                            now.picks(),
                                            sent.flag("liked", true))));
                } else {
                    if (!target && !mayDo(scene, row.authorId(), row.forId())) {
                        throw BoardRules.notYours();
                    }
                    scene.save(
                            row,
                            EntryDraft.from(row)
                                    .doc(new Mission(
                                            now.text(), now.did(), sent.text("text", 200), now.picks(), now.liked())));
                }
            }
            default -> throw BoardRules.unknownVerb();
        }
    }

    // ---------- what it brings to the rest ----------

    /** Only ever about the viewer's own mission. */
    @Override
    public String glance(Scene scene) {
        LocalDate week = MealPlan.monday(scene.today());
        String start = "Week " + week.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR);
        Dealt mine = scene.me() == null ? null : dealt(scene, week).get(scene.myId());
        if (mine == null) {
            return start + " · one small kindness each";
        }
        return start + " · " + (mine.done() ? "yours is done" : "yours is for " + nameOf(scene, mine.target()));
    }

    private static String nameOf(Scene scene, UUID memberId) {
        return Objects.requireNonNullElse(memberId == null ? null : scene.firstName(memberId), "someone");
    }
}
