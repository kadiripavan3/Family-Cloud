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
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import app.homeport.api.thing.ThingStore;
import app.homeport.api.thing.ThingStore.ThingRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.Random;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Secret Santa: the names are drawn inside the API, so there is no organiser who knows everything.
 *
 * <p><b>The draw.</b> Everyone in the hat gives to one person and receives from one. Nobody draws themselves,
 * and two people who "can't draw each other" (a couple) never do. The draw is one of all the ways that can be
 * done, each as likely as the next (see {@link #draw}). When the rules leave no way at all, or leave someone
 * only one name they could possibly draw (so everyone could work it out), the draw doesn't happen and a
 * sentence says why. A draw needs three names: with two, each would know who has them.
 *
 * <p><b>Who sees what.</b> It is decided in {@link #sees}, and only there. Who is in the hat, the rules and
 * the budget are for everyone. A pairing is shown to one person only: the one who drew it, as "you're buying
 * for Lena". Not to whoever started the board, not to whoever pressed "draw". A wish list is read by its
 * writer and, once the names are drawn, by the one person who drew them. Nothing else about the pairings
 * leaves the API: they are never listed, counted, searched or put in an order, and the only thing a person
 * can tick ("I've got it") is seen by nobody else.
 *
 * <p>Only someone with a sign-in of their own can be in the hat, because the name they draw is shown to them
 * alone. Once the names are drawn the hat and the rules are closed. The draw can be undone (everyone draws
 * again) only while nobody has said they have their present.
 */
@Component
class SecretSanta implements BoardRules {

    static final String NAME = "name";
    static final String APART = "apart";
    static final String DRAWN = "drawn";
    static final String WISH = "wish";
    private static final int MOST_NAMES = 30;
    private static final int MOST_WISHES = 20;
    private static final Random RANDOM = new SecureRandom();

    // ---------- what is stored ----------

    record SecretSantaSettings(
            @Schema(description = "The most a present should cost, in whole cents. 0 for no limit.")
            long budgetCents,

            String currency,

            @Schema(nullable = true, description = "The day the presents are swapped")
            LocalDate swapOn,

            @Schema(nullable = true, description = "Where or when, in the crew's words: the reunion dinner")
            String swapAt,

            @Schema(
                    nullable = true,
                    description = "Something of the circle the swap belongs to: the dinner's own board")
            UUID swapThingId,

            @Schema(nullable = true, description = "The day the names were drawn")
            LocalDate drawnOn) {}

    /** Two people who can't draw each other. The entry is for the first; this names the second. */
    record Apart(UUID other, String why) {}

    /** Who the entry's person gives to. */
    record Drawn(UUID to) {}

    record Wish(String text) {}

    // ---------- the draw ----------

    /** Two people who can't draw each other, by their place in the hat. */
    record Pair(int a, int b) {}

    private static ApiProblem cantBeDrawn() {
        return ApiProblem.conflict(
                "cant_be_drawn",
                "With these rules the names can't be drawn: someone would be left with nobody to draw. Take a rule"
                        + " away, or add a name.");
    }

    /**
     * Draws the names: for each place in the hat, the place of the person they give to. Nobody gives to
     * themselves or to someone they are kept apart from, and everyone receives exactly once. Every way the
     * rules allow is as likely as any other.
     *
     * @param names how many names are in the hat
     * @param apart the pairs who can't draw each other
     * @param namesForSentences what to call each place when a sentence has to name someone
     */
    static int[] draw(int names, List<Pair> apart, List<String> namesForSentences, Random random) {
        if (names < 3) {
            throw ApiProblem.conflict(
                    "too_few", "A draw needs at least three names. With two, each would know who has them.");
        }
        boolean[][] allowed = new boolean[names][names];
        for (int giver = 0; giver < names; giver++) {
            Arrays.fill(allowed[giver], true);
            allowed[giver][giver] = false;
        }
        for (Pair pair : apart) {
            allowed[pair.a()][pair.b()] = false;
            allowed[pair.b()][pair.a()] = false;
        }
        if (anyWay(allowed, -1, -1) == null) {
            throw cantBeDrawn();
        }
        // Someone with only one name they could ever draw has no secret: the rules give it away.
        for (int giver = 0; giver < names; giver++) {
            int could = 0;
            for (int receiver = 0; receiver < names; receiver++) {
                if (allowed[giver][receiver] && anyWay(allowed, giver, receiver) != null) {
                    could++;
                }
            }
            if (could < 2) {
                throw ApiProblem.conflict(
                        "no_secret",
                        "With these rules everyone could work out who " + namesForSentences.get(giver)
                                + " draws. Take a rule away, or add a name.");
            }
        }
        // Shuffle the hat and keep the first shuffle the rules allow: that is every allowed way, equally likely.
        List<Integer> hat = new ArrayList<>();
        for (int i = 0; i < names; i++) {
            hat.add(i);
        }
        for (int tries = 0; tries < 5000; tries++) {
            Collections.shuffle(hat, random);
            boolean fits = true;
            for (int giver = 0; giver < names && fits; giver++) {
                fits = allowed[giver][hat.get(giver)];
            }
            if (fits) {
                return hat.stream().mapToInt(Integer::intValue).toArray();
            }
        }
        // Rules so tight that shuffling rarely fits: take a way that is known to exist.
        return anyWay(allowed, -1, -1);
    }

    /**
     * One way to give every giver a receiver of their own that the rules allow, or null when there is none.
     * With a giver and a receiver named, only ways in which that giver has that receiver are looked for.
     */
    private static int[] anyWay(boolean[][] allowed, int fixedGiver, int fixedReceiver) {
        int n = allowed.length;
        int[] giverOf = new int[n];
        Arrays.fill(giverOf, -1);
        if (fixedGiver >= 0) {
            giverOf[fixedReceiver] = fixedGiver;
        }
        for (int giver = 0; giver < n; giver++) {
            if (giver != fixedGiver && !place(allowed, giver, new boolean[n], giverOf, fixedGiver, fixedReceiver)) {
                return null;
            }
        }
        int[] to = new int[n];
        for (int receiver = 0; receiver < n; receiver++) {
            to[giverOf[receiver]] = receiver;
        }
        return to;
    }

    /** Finds a receiver for one giver, moving givers placed earlier on to another receiver where that helps. */
    private static boolean place(
            boolean[][] allowed, int giver, boolean[] tried, int[] giverOf, int fixedGiver, int fixedReceiver) {
        for (int receiver = 0; receiver < allowed.length; receiver++) {
            if (!allowed[giver][receiver] || tried[receiver] || receiver == fixedReceiver) {
                continue;
            }
            tried[receiver] = true;
            if (giverOf[receiver] < 0 || place(allowed, giverOf[receiver], tried, giverOf, fixedGiver, fixedReceiver)) {
                giverOf[receiver] = giver;
                return true;
            }
        }
        return false;
    }

    // ---------- what a person sees ----------

    record SecretSantaViewResponse(
            boolean drawn,
            @Schema(nullable = true) LocalDate drawnOn,

            @Schema(description = "Who is in the hat") List<SecretSantaNameResponse> names,

            @Schema(description = "True when this person is in the hat")
            boolean inTheHat,

            @Schema(description = "The pairs who can't draw each other")
            List<SecretSantaApartResponse> apart,

            long budgetCents,
            String currency,
            @Schema(nullable = true) LocalDate swapOn,
            @Schema(nullable = true) String swapAt,

            @Schema(nullable = true, description = "What the swap belongs to, when this person can see it")
            SecretSantaSwapResponse swapThing,

            @Schema(
                    nullable = true,
                    description = "The one name this person drew, with that person's wish list. Null before the draw.")
            SecretSantaYoursResponse yours,

            @Schema(description = "This person's own wish list")
            List<SecretSantaWishResponse> myWishes) {}

    record SecretSantaNameResponse(UUID id, PersonBrief person, boolean you) {}

    record SecretSantaApartResponse(
            UUID id,
            PersonBrief a,
            PersonBrief b,

            @Schema(nullable = true, description = "Why, in the crew's words: they're a couple")
            String why) {}

    record SecretSantaSwapResponse(UUID id, ThingKind kind, String title) {}

    record SecretSantaYoursResponse(
            PersonBrief person,

            @Schema(description = "What they would like, in their own words")
            List<String> wishes,

            @Schema(description = "True once this person ticked that they have the present")
            boolean gotIt) {}

    record SecretSantaWishResponse(UUID id, String text) {}

    private final ThingStore things;

    SecretSanta(ThingStore things) {
        this.things = things;
    }

    @Override
    public Template template() {
        return Template.SECRET_SANTA;
    }

    @Override
    public Class<?> settingsType() {
        return SecretSantaSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return SecretSantaViewResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: budgetCents (0 for no limit), currency, swapOn (a date), swapAt (words), swapThingId"
                        + " (something of the circle to open from the swap's row)",
                "entry name: memberId (someone with their own sign-in). Before the draw only; a new board starts"
                        + " with everyone in the hat.",
                "entry apart: memberId, otherMemberId, why. Two people who can't draw each other. Before the draw only.",
                "entry wish: text. Your own wish list: you and whoever drew you read it.",
                "verb draw: draws the names. Each person is shown only the one they drew.",
                "verb undo_draw: everyone draws again. Only while nobody has their present.",
                "verb got_it: got (true or false; left out: true). Seen by nobody else.");
    }

    @Override
    public boolean viewersMayWrite(String kind) {
        return kind.equals(WISH);
    }

    @Override
    public boolean viewersMay(String verb) {
        return verb.equals("got_it");
    }

    @Override
    public Object settings(Scene scene, Fields sent) {
        SecretSantaSettings now = scene.isNew()
                ? new SecretSantaSettings(0, Cash.EUR, null, null, null, null)
                : scene.settings(SecretSantaSettings.class);
        Long budget = sent.whole("budgetCents", 0, 100_000_000, now.budgetCents());
        UUID swapThing = sent.id("swapThingId", now.swapThingId());
        if (sent.has("swapThingId") && swapThing != null && swapThing(scene, swapThing) == null) {
            throw ApiProblem.badRequest("not_found", "Choose something of this circle that you can see.");
        }
        return new SecretSantaSettings(
                budget == null ? 0 : budget,
                sent.has("currency") ? Cash.currency(sent.text("currency", 3)) : now.currency(),
                sent.day("swapOn", now.swapOn()),
                sent.text("swapAt", 80, now.swapAt()),
                swapThing,
                now.drawnOn());
    }

    /** Everyone who can take part starts in the hat. */
    @Override
    public void started(Scene scene) {
        for (Person person : Say.voices(scene)) {
            scene.add(
                    EntryDraft.of(NAME).by(scene.myId()).forMember(person.id()),
                    Scene.derivedId(scene.boardId(), "name " + person.id()));
        }
    }

    private ThingRow swapThing(Scene scene, UUID thingId) {
        if (thingId == null || scene.me() == null) {
            return null;
        }
        return things.findAll(List.of(thingId), scene.me().userId()).stream()
                .filter(thing -> thing.circleId().equals(scene.circleId()))
                .findFirst()
                .orElse(null);
    }

    // ---------- who sees what ----------

    /** The pairing this person drew, or null: before the draw, and for someone who isn't in the hat. */
    private static EntryRow mine(Scene scene) {
        return scene.entries(DRAWN).stream()
                .filter(d -> scene.isMe(d.forId()))
                .findFirst()
                .orElse(null);
    }

    /** The one place that decides what a person may know of an entry. */
    private static boolean sees(Scene scene, EntryRow entry) {
        return switch (entry.kind()) {
            case NAME, APART -> true;
            case DRAWN -> scene.isMe(entry.forId());
            case WISH -> {
                EntryRow mine = mine(scene);
                yield scene.isMe(entry.authorId())
                        || (mine != null
                                && entry.authorId() != null
                                && entry.authorId().equals(mine.as(Drawn.class).to()));
            }
            default -> false;
        };
    }

    private static boolean drawn(Scene scene) {
        return !scene.entries(DRAWN).isEmpty();
    }

    /** The people in the hat who are still in the circle, in the hat's order. */
    private static List<EntryRow> hat(Scene scene) {
        return scene.entries(NAME).stream()
                .filter(n -> scene.person(n.forId()) != null)
                .toList();
    }

    // ---------- what a person sees ----------

    @Override
    public Object view(Scene scene, String show) {
        SecretSantaSettings settings = scene.settings(SecretSantaSettings.class);
        List<EntryRow> hat = hat(scene);
        EntryRow mine = mine(scene);
        ThingRow swap = swapThing(scene, settings.swapThingId());
        return new SecretSantaViewResponse(
                drawn(scene),
                drawn(scene) ? settings.drawnOn() : null,
                hat.stream()
                        .map(n -> new SecretSantaNameResponse(n.id(), scene.brief(n.forId()), scene.isMe(n.forId())))
                        .toList(),
                hat.stream().anyMatch(n -> scene.isMe(n.forId())),
                scene.entries(APART).stream()
                        .filter(a -> scene.brief(a.forId()) != null
                                && scene.brief(a.as(Apart.class).other()) != null)
                        .map(a -> new SecretSantaApartResponse(
                                a.id(),
                                scene.brief(a.forId()),
                                scene.brief(a.as(Apart.class).other()),
                                a.as(Apart.class).why()))
                        .toList(),
                settings.budgetCents(),
                settings.currency(),
                settings.swapOn(),
                settings.swapAt(),
                swap == null ? null : new SecretSantaSwapResponse(swap.id(), swap.kind(), swap.title()),
                mine == null ? null : yours(scene, mine),
                scene.entries(WISH).stream()
                        .filter(w -> scene.isMe(w.authorId()))
                        .map(w -> new SecretSantaWishResponse(
                                w.id(), w.as(Wish.class).text()))
                        .toList());
    }

    private static SecretSantaYoursResponse yours(Scene scene, EntryRow mine) {
        UUID to = mine.as(Drawn.class).to();
        return new SecretSantaYoursResponse(
                scene.brief(to),
                scene.entries(WISH).stream()
                        .filter(w -> Objects.equals(w.authorId(), to) && sees(scene, w))
                        .map(w -> w.as(Wish.class).text())
                        .toList(),
                mine.done());
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        return entry.is(WISH) && sees(scene, entry) ? entry.as(Wish.class).text() : null;
    }

    // ---------- changing it ----------

    private static void beforeTheDraw(Scene scene) {
        if (drawn(scene)) {
            throw ApiProblem.conflict(
                    "drawn", "The names are drawn. Undo the draw first: then everyone draws a new name.");
        }
    }

    private static UUID inTheHat(Scene scene, UUID memberId) {
        if (memberId == null || hat(scene).stream().noneMatch(n -> memberId.equals(n.forId()))) {
            throw ApiProblem.badRequest("not_in_the_hat", "Choose someone who is in the hat.");
        }
        return memberId;
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        switch (kind) {
            case NAME -> {
                beforeTheDraw(scene);
                UUID member = scene.inCircle(sent.id("memberId"));
                if (member == null || !Say.voiceIds(scene).contains(member)) {
                    throw ApiProblem.badRequest(
                            "no_sign_in",
                            "Only someone with their own sign-in can be in the hat: the name they draw is shown to"
                                    + " them alone.");
                }
                EntryRow there = hat(scene).stream()
                        .filter(n -> member.equals(n.forId()))
                        .findFirst()
                        .orElse(null);
                if (there != null) {
                    return there.id();
                }
                if (hat(scene).size() >= MOST_NAMES) {
                    throw ApiProblem.conflict("too_many", "Thirty names is as many as the hat holds.");
                }
                return scene.add(EntryDraft.of(NAME).by(scene.myId()).forMember(member), clientId);
            }
            case APART -> {
                beforeTheDraw(scene);
                UUID one = inTheHat(scene, sent.id("memberId"));
                UUID other = inTheHat(scene, sent.id("otherMemberId"));
                if (one.equals(other)) {
                    throw ApiProblem.badRequest("same_person", "Choose two different people.");
                }
                return scene.add(
                        EntryDraft.of(APART)
                                .by(scene.myId())
                                .forMember(one)
                                .doc(new Apart(other, sent.text("why", 80))),
                        clientId);
            }
            case WISH -> {
                if (scene.myId() == null) {
                    throw BoardRules.notYours();
                }
                if (scene.entries(WISH).stream()
                                .filter(w -> scene.isMe(w.authorId()))
                                .count()
                        >= MOST_WISHES) {
                    throw ApiProblem.conflict("too_many", "Twenty wishes is as long as a list gets.");
                }
                return scene.add(
                        EntryDraft.of(WISH)
                                .by(scene.myId())
                                .forMember(scene.myId())
                                .doc(new Wish(sent.need("text", 200, "Write what you'd like."))),
                        clientId);
            }
            default -> throw BoardRules.unknownKind();
        }
    }

    /** A wish is changed by its writer. A pairing is never changed, and isn't there for anyone to try. */
    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        if (entry.is(WISH) && scene.isMe(entry.authorId())) {
            scene.save(entry, EntryDraft.from(entry).doc(new Wish(sent.need("text", 200, "Write what you'd like."))));
            return;
        }
        if (entry.is(APART) && scene.canEdit()) {
            beforeTheDraw(scene);
            Apart now = entry.as(Apart.class);
            scene.save(entry, EntryDraft.from(entry).doc(new Apart(now.other(), sent.text("why", 80, now.why()))));
            return;
        }
        throw Scene.entryGone();
    }

    @Override
    public void remove(Scene scene, EntryRow entry) {
        if (entry.is(WISH) && scene.isMe(entry.authorId())) {
            scene.remove(entry.id());
            return;
        }
        if ((entry.is(NAME) || entry.is(APART)) && scene.canEdit()) {
            beforeTheDraw(scene);
            scene.remove(entry.id());
            return;
        }
        throw Scene.entryGone();
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        switch (verb) {
            case "draw" -> drawNames(scene);
            case "undo_draw" -> {
                List<EntryRow> pairings = scene.entries(DRAWN);
                if (pairings.stream().anyMatch(EntryRow::done)) {
                    throw ApiProblem.conflict(
                            "someone_has_theirs", "Someone has their present already. The draw stays.");
                }
                pairings.forEach(p -> scene.remove(p.id()));
            }
            case "got_it" -> {
                EntryRow mine = mine(scene);
                if (mine == null) {
                    throw ApiProblem.conflict("not_drawn", "The names aren't drawn yet.");
                }
                boolean got = sent.flag("got", true);
                if (got != mine.done()) {
                    scene.save(mine, EntryDraft.from(mine).done(got ? scene.now() : null, got ? scene.myId() : null));
                }
            }
            default -> throw BoardRules.unknownVerb();
        }
    }

    private static void drawNames(Scene scene) {
        beforeTheDraw(scene);
        List<UUID> hat = hat(scene).stream()
                .map(EntryRow::forId)
                .filter(id -> !scene.person(id).left())
                .toList();
        List<Pair> apart = new ArrayList<>();
        for (EntryRow rule : scene.entries(APART)) {
            int a = hat.indexOf(rule.forId());
            int b = hat.indexOf(rule.as(Apart.class).other());
            if (a >= 0 && b >= 0) {
                apart.add(new Pair(a, b));
            }
        }
        int[] to = draw(hat.size(), apart, hat.stream().map(scene::firstName).toList(), RANDOM);
        for (int giver = 0; giver < to.length; giver++) {
            scene.add(EntryDraft.of(DRAWN).forMember(hat.get(giver)).doc(new Drawn(hat.get(to[giver]))), null);
        }
        SecretSantaSettings settings = scene.settings(SecretSantaSettings.class);
        scene.saveSettings(new SecretSantaSettings(
                settings.budgetCents(),
                settings.currency(),
                settings.swapOn(),
                settings.swapAt(),
                settings.swapThingId(),
                scene.today()));
    }

    // ---------- what it brings to the rest ----------

    @Override
    public String glance(Scene scene) {
        SecretSantaSettings settings = scene.settings(SecretSantaSettings.class);
        String names = Words.count(hat(scene).size(), "name") + " in the hat";
        return drawn(scene) && settings.drawnOn() != null
                ? "Drawn on " + Words.shortDay(settings.drawnOn()) + " · " + names
                : names + " · not drawn yet";
    }

    /** From the draw until the swap, for someone who drew a name and hasn't ticked that they have the present. */
    @Override
    public List<TodayCard> cards(Scene scene) {
        SecretSantaSettings settings = scene.settings(SecretSantaSettings.class);
        EntryRow mine = mine(scene);
        if (mine == null
                || mine.done()
                || (settings.swapOn() != null && scene.today().isAfter(settings.swapOn()))) {
            return List.of();
        }
        return List.of(new TodayCard(
                scene.boardId(),
                ThingKind.BOARD,
                template().code(),
                template().emoji(),
                "Secret Santa has been drawn",
                "You know yours. Nobody knows who has you.",
                null,
                null,
                null,
                20));
    }

    @Override
    public String guest(Scene scene) {
        return Say.upperFirst(Say.spell(hat(scene).size())) + " names in the hat."
                + (drawn(scene) ? " They are drawn, and nobody sees the list." : "");
    }
}
