package app.homeport.api.board.templates;

import app.homeport.api.board.BoardRules;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.board.Words;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.library.AlbumService;
import app.homeport.api.library.AlbumService.NewAlbum;
import app.homeport.api.money.Cash;
import app.homeport.api.plan.EventService;
import app.homeport.api.plan.EventService.NewEvent;
import app.homeport.api.plan.EventService.When;
import app.homeport.api.thing.Audience;
import app.homeport.api.thing.ThingService;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

/**
 * The Saturday jar: everyone drops in ideas all year; on a free day the jar is shaken for something to do.
 *
 * <p><b>Shaking.</b> The jar is asked how much time there is, what it may cost, and whether it should be
 * indoors or outdoors, and pulls one idea at random among those that fit ({@link #fits}). Shaking again pulls
 * a different one when there is one. The slip pulled today is the same for everyone who looks. An idea
 * someone said yes to ("Let's do it") leaves the jar: it is put in the calendar as an event of that day, with
 * an album next to it waiting for the photos, through the calendar's and the library's own services.
 *
 * <p><b>The weather.</b> The drawing says "Dry until 4". No weather source is connected, so the settings
 * carry a {@code weather} word that nothing sets, and the jar asks "indoors or outdoors?" instead. Whether
 * everyone is free that day is the calendar's to say ({@link FreeDay}); until it does, the jar doesn't claim it.
 *
 * <p>Nothing here is secret: everyone who sees the jar sees all of it, and everyone who sees it may drop an
 * idea in.
 */
@Component
class SaturdayJar implements BoardRules {

    static final String IDEA = "idea";
    static final String PULL = "pull";
    private static final Set<String> PLACES = Set.of("home", "indoors", "outdoors");

    record SaturdayJarSettings(
            @Schema(
                    nullable = true,
                    description = "What the sky is doing today. A weather source would write it here; none is"
                            + " connected, so it is always null and the jar asks “indoors or outdoors?” instead.")
            String weather) {}

    /**
     * An idea. The entry's {@code for_id} is who put it in, {@code done_at} when someone said yes to it, and
     * {@code day} the day it was done on.
     *
     * @param place home, indoors or outdoors; null for anywhere
     * @param cents about what it costs; null or 0 for free
     */
    record Idea(String text, String emoji, String place, Integer minutes, Long cents, UUID eventId, UUID albumId) {}

    /** What the jar was asked when it was last shaken. Null means "it doesn't matter". */
    record Asked(Integer minutes, Long cents, Boolean outdoors) {}

    record SaturdayJarResponse(
            @Schema(description = "How many ideas are in the jar")
            int count,

            @Schema(description = "How many were done so far")
            int done,

            @Schema(nullable = true, description = "What the jar was asked today. Null when it wasn't shaken today.")
            SaturdayJarAskedResponse asked,

            @Schema(nullable = true, description = "The slip pulled today")
            SaturdayJarIdeaResponse pulled,

            @Schema(nullable = true, description = "Always null for now: see the settings")
            String weather,

            @Schema(
                    nullable = true,
                    description = "True when nobody has anything on today, by the calendar. Null while the calendar"
                            + " doesn't say.")
            Boolean everyoneFree,

            @Schema(description = "How many people that is about")
            int people,

            @Schema(description = "What someone said yes to, for today or later. Ten at most.")
            List<SaturdayJarIdeaResponse> comingUp) {}

    record SaturdayJarAskedResponse(
            @Schema(nullable = true, description = "The time there is, in minutes")
            Integer minutes,

            @Schema(nullable = true, description = "What it may cost, in cents")
            Long cents,

            @Schema(nullable = true, description = "True for outdoors, false for indoors")
            Boolean outdoors) {}

    record SaturdayJarIdeaResponse(
            UUID id,
            String text,
            @Schema(nullable = true) String emoji,

            @Schema(nullable = true, description = "Who put it in")
            PersonBrief by,

            boolean mine,

            @Schema(nullable = true, description = "home, indoors or outdoors. Null for anywhere.")
            String place,

            @Schema(nullable = true, description = "How long it takes, in minutes")
            Integer minutes,

            @Schema(nullable = true, description = "About what it costs, in cents. Null or 0: free.")
            Long cents,

            @Schema(description = "The day it was put in") LocalDate addedOn,

            @Schema(description = "True once someone said yes to it: it has left the jar")
            boolean done,

            @Schema(nullable = true, description = "The day it is done on")
            LocalDate doneOn,

            @Schema(nullable = true, description = "The event it became in the calendar")
            UUID eventId,

            @Schema(nullable = true, description = "The album waiting for its photos")
            UUID albumId) {}

    private final EventService events;
    private final AlbumService albums;
    private final ThingService things;
    private final ObjectProvider<FreeDay> calendar;

    SaturdayJar(EventService events, AlbumService albums, ThingService things, ObjectProvider<FreeDay> calendar) {
        this.events = events;
        this.albums = albums;
        this.things = things;
        this.calendar = calendar;
    }

    @Override
    public Template template() {
        return Template.SATURDAY_JAR;
    }

    @Override
    public Class<?> settingsType() {
        return SaturdayJarSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return SaturdayJarResponse.class;
    }

    @Override
    public Class<?> entryType() {
        return SaturdayJarIdeaResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: none to send. weather is kept for a weather source and is always null for now.",
                "entry idea: text, emoji, place (home, indoors or outdoors), minutes, cents, byMemberId (you, or a"
                        + " child you look after). Everyone who sees the jar may add one. Changing one can also send"
                        + " done: false, to put it back in the jar.",
                "verb shake: minutes (the time there is), cents (what it may cost), outdoors (true or false). Each"
                        + " may be left out: it then doesn't matter.",
                "verb do: ideaId (left out: the slip pulled today), day (left out: today), timeZone (the phone's;"
                        + " left out: UTC). It leaves the jar and becomes an event of that day with an album next"
                        + " to it.",
                "filter (for the list of entries): fits (what was asked today), rainy, home, free",
                "Everyone who sees the board may use these verbs, also with a board they may only look at.");
    }

    @Override
    public boolean viewersMayWrite(String kind) {
        return kind.equals(IDEA);
    }

    @Override
    public boolean viewersMay(String verb) {
        return verb.equals("shake") || verb.equals("do");
    }

    // ---------- the rule ----------

    /** True when an idea fits what the jar was asked. What an idea doesn't say about itself never rules it out. */
    static boolean fits(Idea idea, Asked asked) {
        if (asked == null) {
            return true;
        }
        boolean time = asked.minutes() == null || idea.minutes() == null || idea.minutes() <= asked.minutes();
        boolean cost = asked.cents() == null || idea.cents() == null || idea.cents() <= asked.cents();
        boolean sky = !Boolean.FALSE.equals(asked.outdoors()) || !"outdoors".equals(idea.place());
        return time && cost && sky;
    }

    private static boolean free(Idea idea) {
        return idea.cents() == null || idea.cents() == 0;
    }

    private static List<EntryRow> inTheJar(Scene scene) {
        return scene.entries(IDEA).stream().filter(idea -> !idea.done()).toList();
    }

    /** Today's slip: the one row that says what was pulled last, when that was today. */
    private static EntryRow pullOfToday(Scene scene) {
        return scene.entries(PULL).stream()
                .filter(pull -> scene.today().equals(pull.day()))
                .findFirst()
                .orElse(null);
    }

    // ---------- settings ----------

    @Override
    public Object settings(Scene scene, Fields sent) {
        return new SaturdayJarSettings(null);
    }

    // ---------- what a person sees ----------

    @Override
    public Object view(Scene scene, String show) {
        EntryRow pull = pullOfToday(scene);
        Asked asked = pull == null ? null : pull.as(Asked.class);
        EntryRow pulled = pull == null || pull.parentId() == null
                ? null
                : scene.entries(IDEA).stream()
                        .filter(idea -> idea.id().equals(pull.parentId()))
                        .findFirst()
                        .orElse(null);
        List<UUID> busy = scene.me() == null
                ? null
                : calendar.stream()
                        .findFirst()
                        .map(source -> source.busy(scene.circleId(), scene.me().userId(), scene.today()))
                        .orElse(null);
        return new SaturdayJarResponse(
                inTheJar(scene).size(),
                (int) scene.entries(IDEA).stream().filter(EntryRow::done).count(),
                asked == null ? null : new SaturdayJarAskedResponse(asked.minutes(), asked.cents(), asked.outdoors()),
                pulled == null ? null : idea(scene, pulled),
                scene.settings(SaturdayJarSettings.class).weather(),
                busy == null ? null : busy.isEmpty(),
                scene.humans().size(),
                scene.entries(IDEA).stream()
                        .filter(idea ->
                                idea.done() && idea.day() != null && !idea.day().isBefore(scene.today()))
                        .limit(10)
                        .map(idea -> idea(scene, idea))
                        .toList());
    }

    private static SaturdayJarIdeaResponse idea(Scene scene, EntryRow row) {
        Idea idea = row.as(Idea.class);
        return new SaturdayJarIdeaResponse(
                row.id(),
                idea.text(),
                idea.emoji(),
                scene.brief(row.forId()),
                scene.isMe(row.forId()) || scene.isMe(row.authorId()),
                idea.place(),
                idea.minutes(),
                idea.cents(),
                row.createdAt().atOffset(ZoneOffset.UTC).toLocalDate(),
                row.done(),
                row.day(),
                idea.eventId(),
                idea.albumId());
    }

    @Override
    public Object entry(Scene scene, EntryRow entry) {
        return entry.is(IDEA) ? idea(scene, entry) : null;
    }

    @Override
    public boolean passes(Scene scene, EntryRow entry, String filter) {
        if (!entry.is(IDEA) || entry.done()) {
            return false;
        }
        Idea idea = entry.as(Idea.class);
        return switch (filter) {
            case "fits" -> {
                EntryRow pull = pullOfToday(scene);
                yield fits(idea, pull == null ? null : pull.as(Asked.class));
            }
            case "rainy" -> !"outdoors".equals(idea.place());
            case "home" -> "home".equals(idea.place());
            case "free" -> free(idea);
            default -> throw ApiProblem.badRequest("invalid_filter", "Choose fits, rainy, home or free.");
        };
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        return entry.is(IDEA) ? entry.as(Idea.class).text() : null;
    }

    // ---------- changing it ----------

    private static Idea idea(Fields sent, Idea now) {
        String text = sent.text("text", 200, now.text());
        if (text == null) {
            throw ApiProblem.badRequest("missing_text", "Write the idea first.");
        }
        String place = sent.text("place", 10, now.place());
        if (place != null && !PLACES.contains(place)) {
            throw ApiProblem.badRequest("invalid_place", "Choose at home, indoors or outdoors.");
        }
        Long minutes = sent.whole(
                "minutes",
                1,
                10080,
                now.minutes() == null ? null : now.minutes().longValue());
        return new Idea(
                text,
                sent.text("emoji", 16, now.emoji()),
                place,
                minutes == null ? null : minutes.intValue(),
                sent.whole("cents", 0, Cash.MAX_CENTS, now.cents()),
                now.eventId(),
                now.albumId());
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        if (!kind.equals(IDEA)) {
            throw BoardRules.unknownKind();
        }
        UUID by = scene.inCircle(sent.id("byMemberId", scene.myId()));
        if (by == null || !scene.iStandInFor(by)) {
            throw ApiProblem.badRequest("not_yours_to_add", "You can put in your own ideas, or a child's for them.");
        }
        return scene.add(
                EntryDraft.of(IDEA)
                        .by(scene.myId())
                        .forMember(by)
                        .doc(idea(sent, new Idea(null, null, null, null, null, null, null))),
                clientId);
    }

    /** An idea is changed or taken out by whoever put it in, or by anyone who may change the jar. */
    private static void mayChange(Scene scene, EntryRow entry) {
        boolean own = scene.isMe(entry.authorId()) || (entry.forId() != null && scene.iStandInFor(entry.forId()));
        if (!entry.is(IDEA) || !(own || scene.canEdit())) {
            throw BoardRules.notYours();
        }
    }

    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        mayChange(scene, entry);
        EntryDraft draft = EntryDraft.from(entry).doc(idea(sent, entry.as(Idea.class)));
        if (Boolean.FALSE.equals(sent.flag("done"))) {
            draft.done(null, null).day(null);
        }
        scene.save(entry, draft);
    }

    @Override
    public void remove(Scene scene, EntryRow entry) {
        mayChange(scene, entry);
        scene.remove(entry.id());
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        switch (verb) {
            case "shake" -> shake(scene, sent);
            case "do" -> letsDoIt(scene, sent);
            default -> throw BoardRules.unknownVerb();
        }
    }

    private void shake(Scene scene, Fields sent) {
        Long minutes = sent.whole("minutes", 1, 10080);
        Asked asked = new Asked(
                minutes == null ? null : minutes.intValue(),
                sent.whole("cents", 0, Cash.MAX_CENTS),
                sent.flag("outdoors"));
        EntryRow before = scene.entries(PULL).stream().findFirst().orElse(null);
        List<EntryRow> fitting = inTheJar(scene).stream()
                .filter(idea -> fits(idea.as(Idea.class), asked))
                .toList();
        if (fitting.isEmpty()) {
            throw ApiProblem.conflict(
                    "nothing_fits",
                    inTheJar(scene).isEmpty()
                            ? "The jar is empty. Drop an idea in first."
                            : "Nothing in the jar fits that. Ask for less, or drop a new idea in.");
        }
        // A different slip than the last one, when there is another that fits.
        List<EntryRow> others = before == null
                ? fitting
                : fitting.stream()
                        .filter(idea -> !idea.id().equals(before.parentId()))
                        .toList();
        List<EntryRow> from = others.isEmpty() ? fitting : others;
        EntryRow pulled = from.get(ThreadLocalRandom.current().nextInt(from.size()));
        EntryDraft draft = (before == null ? EntryDraft.of(PULL) : EntryDraft.from(before))
                .under(pulled.id())
                .by(scene.myId())
                .day(scene.today())
                .doc(asked);
        if (before == null) {
            scene.add(draft, Scene.derivedId(scene.boardId(), "the slip"));
        } else {
            scene.save(before, draft);
        }
    }

    /** Says yes to an idea: it leaves the jar, lands in the calendar, and gets an album for the photos. */
    private void letsDoIt(Scene scene, Fields sent) {
        EntryRow pull = pullOfToday(scene);
        UUID ideaId = sent.id("ideaId", pull == null ? null : pull.parentId());
        EntryRow row = scene.need(ideaId);
        if (!row.is(IDEA)) {
            throw Scene.entryGone();
        }
        if (row.done()) {
            return; // said yes to already; saying it again changes nothing
        }
        LocalDate day = sent.day("day", scene.today());
        if (day == null || day.isBefore(scene.today())) {
            throw ApiProblem.badRequest("invalid_day", "Choose today or a day to come.");
        }
        Idea idea = row.as(Idea.class);
        UUID user = scene.me().userId();
        // Shared like the jar is; "some people" can't be copied from here, so then it starts as the circle's kind says.
        Audience like = scene.audience() == Audience.SOME ? null : scene.audience();
        UUID event = events.create(
                        user,
                        new NewEvent(
                                scene.circleId(),
                                idea.text(),
                                new When(day, null, null, null, sent.text("timeZone", 60, "UTC")),
                                null,
                                "From " + scene.title(),
                                null,
                                null,
                                null,
                                List.of(),
                                null,
                                like),
                        Scene.derivedId(row.id(), "event"))
                .id();
        UUID album = albums.create(
                        user,
                        new NewAlbum(
                                Scene.derivedId(row.id(), "album"),
                                scene.circleId(),
                                idea.text(),
                                Words.day(day),
                                like,
                                null,
                                null,
                                null,
                                null))
                .id();
        things.link(event, album, user);
        scene.save(
                row,
                EntryDraft.from(row)
                        .day(day)
                        .done(scene.now(), scene.myId())
                        .doc(new Idea(
                                idea.text(), idea.emoji(), idea.place(), idea.minutes(), idea.cents(), event, album)));
    }

    // ---------- what it brings to the rest ----------

    @Override
    public String glance(Scene scene) {
        return Words.count(inTheJar(scene).size(), "idea") + " in the jar";
    }
}
