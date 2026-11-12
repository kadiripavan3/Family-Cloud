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
import app.homeport.api.common.ApiProblem;
import app.homeport.api.home.TodaySource.TodayCard;
import app.homeport.api.media.MediaKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Both said yes: each says yes or no to ideas in private, and only what everyone said yes to is ever shown.
 *
 * <p>Ideas are kept in decks (dinner, a film, a holiday, names). Each person goes through a deck alone and
 * says yes or no to each idea.
 *
 * <p><b>Who sees what.</b> A person's answers are theirs alone. The one thing another person's answers are
 * ever used for is {@link #matched}: an idea is a match when everyone has said yes to it, and a match is
 * shown to all of them. Nothing else about anyone's answers leaves the API for anyone but their owner: not a
 * yes that wasn't matched, not a no, and no count of either. Of another person's progress one thing is told,
 * because the drawing says it: whether they have been through the whole deck ("Alex has finished").
 *
 * <p>That last part, and the game itself, let a person work something out: when the other has finished and an
 * idea they said yes to isn't a match, the other said no to it. That can't be hidden without hiding the
 * matches too. What the API never does is say it.
 *
 * <p>An idea that is reworded is asked again: every answer to it is forgotten, so nobody's yes is carried
 * over to words they never saw.
 */
@Component
class BothYes implements BoardRules {

    static final String DECK = "deck";
    static final String IDEA = "idea";
    static final String SAY = "say";
    private static final int MAX_DECKS = 30;
    private static final int MAX_IDEAS = 500;

    record BothYesSettings(
            @Schema(description = "The members who answer. An idea is a match when all of them said yes.")
            List<UUID> people) {
        BothYesSettings {
            people = people == null ? List.of() : List.copyOf(people);
        }
    }

    /**
     * A deck. The entry's {@code day} is the day it is for, when it has one, and {@code media_id} its picture.
     *
     * @param label a short word for a tab: Dinner
     * @param locked true for a deck the app keeps behind the phone's lock
     */
    record Deck(String name, String label, String emoji, Boolean locked) {}

    record Idea(String text, String emoji) {}

    record BothYesResponse(
            @Schema(description = "The people who answer") List<PersonBrief> people,

            @Schema(description = "True when the person looking is one of them")
            boolean youAnswer,

            @Schema(description = "The decks, in their order. Thirty at most.")
            List<BothYesDeckResponse> decks,

            @Schema(
                    nullable = true,
                    description = "The deck that is open: the one asked for, or the first with something left")
            BothYesOpenDeckResponse deck) {}

    record BothYesDeckResponse(
            UUID id,
            String name,

            @Schema(description = "A short word for a tab: Dinner")
            String label,

            @Schema(nullable = true) String emoji,

            @Schema(
                    description =
                            "True for a deck the app keeps behind the phone's lock. The API hands it out all the same.")
            boolean locked,

            @Schema(nullable = true, description = "The day it is for, when it has one")
            LocalDate day,

            @Schema(nullable = true) BoardMedia picture,

            @Schema(description = "How many ideas it holds") int ideas,

            @Schema(description = "How many of them this person has answered")
            int seen,

            @Schema(description = "True when this person has answered them all")
            boolean youFinished,

            @Schema(description = "The others who have answered them all. Never what they answered.")
            List<PersonBrief> finished,

            @Schema(description = "How many ideas everyone said yes to")
            int matches) {}

    record BothYesOpenDeckResponse(
            UUID id,

            @Schema(
                    nullable = true,
                    description = "The next idea this person hasn't answered. Null when they are through.")
            BothYesIdeaResponse card,

            @Schema(description = "Which one that is: 6, of 8")
            int number,

            int of,

            @Schema(description = "What everyone said yes to, in the deck's order")
            List<BothYesIdeaResponse> matches) {}

    record BothYesIdeaResponse(
            UUID id,
            UUID deckId,
            String text,
            @Schema(nullable = true) String emoji,

            @Schema(nullable = true, description = "This person's own answer. Null: not answered yet.")
            Boolean yours,

            @Schema(description = "True when everyone said yes")
            boolean match) {}

    @Override
    public Template template() {
        return Template.BOTH_YES;
    }

    @Override
    public Class<?> settingsType() {
        return BothYesSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return BothYesResponse.class;
    }

    @Override
    public Class<?> entryType() {
        return BothYesIdeaResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: people (the member ids who answer; left out: everyone in the circle). They stay as they"
                        + " are once anyone has answered.",
                "entry deck: name, label (a short word for a tab), emoji, day (the day it is for, or null), mediaId (a"
                        + " photo upload), locked (true keeps it behind the phone's lock, in the app)",
                "entry idea: deckId, text, emoji. Rewording an idea asks it again: its answers are forgotten.",
                "verb say: ideaId, yes (true or false; null takes your answer back). Everyone who answers may, also"
                        + " with a board they may only look at.",
                "show: a deck's id, to open that deck. Left out: the first deck you haven't finished.");
    }

    @Override
    public boolean viewersMay(String verb) {
        return verb.equals(SAY);
    }

    @Override
    public int ceiling() {
        return 10000;
    }

    // ---------- who sees what ----------

    /** Everyone's answers, by idea and then by person. It never leaves this class. */
    private static Map<UUID, Map<UUID, Boolean>> answers(Scene scene) {
        Map<UUID, Map<UUID, Boolean>> answers = new HashMap<>();
        for (EntryRow say : scene.entries(SAY)) {
            if (say.parentId() != null && say.authorId() != null) {
                answers.computeIfAbsent(say.parentId(), idea -> new HashMap<>())
                        .put(say.authorId(), say.amountOr(0) == 1);
            }
        }
        return answers;
    }

    /** The people who answer and are still in the circle. */
    private static List<UUID> people(Scene scene) {
        return scene.settings(BothYesSettings.class).people().stream()
                .filter(id -> scene.person(id) != null && !scene.person(id).left())
                .toList();
    }

    /**
     * The one place another person's answer is looked at: an idea is a match when every one of the people has
     * said yes to it.
     */
    private static boolean matched(List<UUID> people, Map<UUID, Boolean> said) {
        return !people.isEmpty()
                && said != null
                && people.stream().allMatch(person -> Boolean.TRUE.equals(said.get(person)));
    }

    /** This person's own answer to an idea, or null. Nobody else's is ever handed out. */
    private static Boolean mine(Scene scene, Map<UUID, Boolean> said) {
        return said == null || scene.myId() == null ? null : said.get(scene.myId());
    }

    // ---------- settings ----------

    @Override
    public Object settings(Scene scene, Fields sent) {
        List<UUID> now =
                scene.isNew() ? null : scene.settings(BothYesSettings.class).people();
        List<UUID> people = sent.ids("people", 10);
        if (people == null) {
            people = now != null ? now : scene.humans().stream().map(Person::id).toList();
        }
        for (UUID id : people) {
            scene.inCircle(id);
            if (scene.person(id).kind() == MemberKind.PET) {
                throw ApiProblem.badRequest("not_a_person", "Only people can say yes.");
            }
        }
        if (people.isEmpty()) {
            throw ApiProblem.badRequest("nobody_chosen", "Choose who answers.");
        }
        if (now != null && !now.equals(people) && !scene.entries(SAY).isEmpty()) {
            throw ApiProblem.conflict("has_answers", "Someone has answered already. Who answers stays as it is.");
        }
        return new BothYesSettings(people);
    }

    // ---------- what a person sees ----------

    private static List<EntryRow> ideasOf(Scene scene, UUID deckId) {
        return scene.under(deckId).stream().filter(idea -> idea.is(IDEA)).toList();
    }

    @Override
    public Object view(Scene scene, String show) {
        List<UUID> people = people(scene);
        Map<UUID, Map<UUID, Boolean>> answers = answers(scene);
        List<EntryRow> decks = scene.entries(DECK);
        List<BothYesDeckResponse> shown =
                decks.stream().map(deck -> deck(scene, deck, people, answers)).toList();
        UUID open = null;
        if (show != null) {
            open = decks.stream()
                    .map(EntryRow::id)
                    .filter(id -> id.toString().equals(show))
                    .findFirst()
                    .orElseThrow(() -> ApiProblem.badRequest("invalid_show", "Choose one of the decks."));
        } else if (!shown.isEmpty()) {
            open = shown.stream()
                    .filter(deck -> !deck.youFinished() && deck.ideas() > 0)
                    .map(BothYesDeckResponse::id)
                    .findFirst()
                    .orElse(shown.get(0).id());
        }
        return new BothYesResponse(
                people.stream().map(scene::brief).toList(),
                scene.myId() != null && people.contains(scene.myId()),
                shown,
                open == null ? null : open(scene, open, people, answers));
    }

    private static BothYesDeckResponse deck(
            Scene scene, EntryRow row, List<UUID> people, Map<UUID, Map<UUID, Boolean>> answers) {
        Deck deck = row.as(Deck.class);
        List<EntryRow> ideas = ideasOf(scene, row.id());
        int seen = (int) ideas.stream()
                .filter(idea -> mine(scene, answers.get(idea.id())) != null)
                .count();
        return new BothYesDeckResponse(
                row.id(),
                deck.name(),
                deck.label() == null ? deck.name() : deck.label(),
                deck.emoji(),
                Boolean.TRUE.equals(deck.locked()),
                row.day(),
                scene.media(row.mediaId()),
                ideas.size(),
                seen,
                !ideas.isEmpty() && seen == ideas.size(),
                people.stream()
                        .filter(person -> !scene.isMe(person) && finished(person, ideas, answers))
                        .map(scene::brief)
                        .toList(),
                (int) ideas.stream()
                        .filter(idea -> matched(people, answers.get(idea.id())))
                        .count());
    }

    /** True when a person has answered every idea of a deck. That they have is told; what they said is not. */
    private static boolean finished(UUID person, List<EntryRow> ideas, Map<UUID, Map<UUID, Boolean>> answers) {
        return !ideas.isEmpty()
                && ideas.stream()
                        .allMatch(idea ->
                                answers.getOrDefault(idea.id(), Map.of()).containsKey(person));
    }

    private static BothYesOpenDeckResponse open(
            Scene scene, UUID deckId, List<UUID> people, Map<UUID, Map<UUID, Boolean>> answers) {
        List<EntryRow> ideas = ideasOf(scene, deckId);
        EntryRow next = ideas.stream()
                .filter(idea -> mine(scene, answers.get(idea.id())) == null)
                .findFirst()
                .orElse(null);
        return new BothYesOpenDeckResponse(
                deckId,
                next == null ? null : idea(scene, next, people, answers),
                next == null ? ideas.size() : ideas.indexOf(next) + 1,
                ideas.size(),
                ideas.stream()
                        .filter(idea -> matched(people, answers.get(idea.id())))
                        .map(idea -> idea(scene, idea, people, answers))
                        .toList());
    }

    private static BothYesIdeaResponse idea(
            Scene scene, EntryRow row, List<UUID> people, Map<UUID, Map<UUID, Boolean>> answers) {
        Idea idea = row.as(Idea.class);
        Map<UUID, Boolean> said = answers.get(row.id());
        return new BothYesIdeaResponse(
                row.id(), row.parentId(), idea.text(), idea.emoji(), mine(scene, said), matched(people, said));
    }

    /** The list of entries is the ideas, each with this person's own answer. An answer is never an entry in it. */
    @Override
    public Object entry(Scene scene, EntryRow entry) {
        return entry.is(IDEA) ? idea(scene, entry, people(scene), answers(scene)) : null;
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        return switch (entry.kind()) {
            case DECK -> entry.as(Deck.class).name();
            case IDEA -> entry.as(Idea.class).text();
            default -> null;
        };
    }

    // ---------- changing it ----------

    private static Deck deck(Fields sent, Deck now) {
        String name = sent.text("name", 80, now.name());
        if (name == null) {
            throw ApiProblem.badRequest("missing_name", "Give the deck a name.");
        }
        return new Deck(
                name,
                sent.text("label", 20, now.label()),
                sent.text("emoji", 16, now.emoji()),
                sent.flag("locked", Boolean.TRUE.equals(now.locked())));
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        switch (kind) {
            case DECK -> {
                if (scene.entries(DECK).size() >= MAX_DECKS) {
                    throw ApiProblem.conflict("too_many", "Thirty decks is as many as fit here.");
                }
                return scene.add(
                        EntryDraft.of(DECK)
                                .by(scene.myId())
                                .day(sent.day("day"))
                                .media(scene.upload(sent.id("mediaId"), MediaKind.PHOTO))
                                .doc(deck(sent, new Deck(null, null, null, null))),
                        clientId);
            }
            case IDEA -> {
                EntryRow deck = scene.need(sent.id("deckId"));
                if (!deck.is(DECK)) {
                    throw Scene.entryGone();
                }
                if (ideasOf(scene, deck.id()).size() >= MAX_IDEAS) {
                    throw ApiProblem.conflict("too_many", "Five hundred ideas is as many as one deck holds.");
                }
                return scene.add(
                        EntryDraft.of(IDEA)
                                .under(deck.id())
                                .by(scene.myId())
                                .doc(new Idea(sent.need("text", 200, "Write the idea first."), sent.text("emoji", 16))),
                        clientId);
            }
            default -> throw BoardRules.unknownKind();
        }
    }

    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        switch (entry.kind()) {
            case DECK -> {
                EntryDraft draft =
                        EntryDraft.from(entry).day(sent.day("day", entry.day())).doc(deck(sent, entry.as(Deck.class)));
                if (sent.has("mediaId")) {
                    draft.media(scene.upload(sent.id("mediaId"), MediaKind.PHOTO));
                }
                scene.save(entry, draft);
            }
            case IDEA -> {
                Idea now = entry.as(Idea.class);
                String text = sent.text("text", 200, now.text());
                if (text == null) {
                    throw ApiProblem.badRequest("missing_text", "Write the idea first.");
                }
                if (!text.equals(now.text())) {
                    // New words are asked again, of everyone, and nobody is told who had answered the old ones.
                    scene.under(entry.id()).forEach(say -> scene.remove(say.id()));
                }
                scene.save(entry, EntryDraft.from(entry).doc(new Idea(text, sent.text("emoji", 16, now.emoji()))));
            }
            default -> throw Scene.entryGone(); // an answer is changed by saying yes or no again, never by its id
        }
    }

    @Override
    public void remove(Scene scene, EntryRow entry) {
        if (entry.is(SAY)) {
            throw Scene.entryGone(); // an answer can't be reached by its id, by anyone
        }
        scene.remove(entry.id());
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        if (!verb.equals(SAY)) {
            throw BoardRules.unknownVerb();
        }
        if (scene.myId() == null || !people(scene).contains(scene.myId())) {
            throw new ApiProblem(
                    HttpStatus.FORBIDDEN, "not_yours_to_answer", "You aren't one of the people who answer here.");
        }
        EntryRow idea = scene.need(sent.id("ideaId"));
        if (!idea.is(IDEA)) {
            throw Scene.entryGone();
        }
        EntryRow mine = scene.under(idea.id()).stream()
                .filter(say -> say.is(SAY) && scene.isMe(say.authorId()))
                .findFirst()
                .orElse(null);
        Boolean yes = sent.flag("yes");
        if (yes == null) {
            if (mine != null) {
                scene.remove(mine.id());
            }
            return;
        }
        EntryDraft draft = (mine == null ? EntryDraft.of(SAY).under(idea.id()).by(scene.myId()) : EntryDraft.from(mine))
                .amount(yes ? 1L : 0L)
                .done(scene.now(), scene.myId());
        if (mine == null) {
            scene.add(draft, Scene.derivedId(idea.id(), "say " + scene.myId()));
        } else {
            scene.save(mine, draft);
        }
    }

    // ---------- what it brings to the rest ----------

    /** Matches only: what everyone said yes to is known to all of them. */
    @Override
    public String glance(Scene scene) {
        List<UUID> people = people(scene);
        Map<UUID, Map<UUID, Boolean>> answers = answers(scene);
        long matches = scene.entries(IDEA).stream()
                .filter(idea -> matched(people, answers.get(idea.id())))
                .count();
        return Words.count(matches, "match", "matches") + " · "
                + Words.count(scene.entries(DECK).size(), "deck");
    }

    /**
     * A match worth knowing about today: in the deck whose day comes next ("Thai, on Saturday"), or else one
     * made in the last three days.
     */
    @Override
    public List<TodayCard> cards(Scene scene) {
        List<UUID> people = people(scene);
        if (scene.myId() == null || !people.contains(scene.myId())) {
            return List.of();
        }
        Map<UUID, Map<UUID, Boolean>> answers = answers(scene);
        Map<UUID, EntryRow> decks = scene.entries(DECK).stream().collect(Collectors.toMap(EntryRow::id, deck -> deck));
        List<EntryRow> matches = scene.entries(IDEA).stream()
                .filter(idea -> decks.containsKey(idea.parentId()) && matched(people, answers.get(idea.id())))
                .toList();
        // First the deck with a day to come, the nearest one; then the match made last.
        EntryRow dated = matches.stream()
                .filter(idea -> decks.get(idea.parentId()).day() != null
                        && !decks.get(idea.parentId()).day().isBefore(scene.today()))
                .min(Comparator.comparing(idea -> decks.get(idea.parentId()).day()))
                .orElse(null);
        EntryRow fresh = matches.stream()
                .filter(idea -> decks.get(idea.parentId()).day() == null
                        && madeAt(scene, idea).isAfter(scene.now().minus(3, ChronoUnit.DAYS)))
                .max(Comparator.comparing(idea -> madeAt(scene, idea)))
                .orElse(null);
        EntryRow match = dated != null ? dated : fresh;
        if (match == null) {
            return List.of();
        }
        EntryRow deck = decks.get(match.parentId());
        String text = match.as(Idea.class).text();
        BoardMedia picture = scene.media(deck.mediaId());
        return List.of(Phrases.card(
                scene,
                scene.title(),
                deck.day() == null
                        ? text + " · " + deck.as(Deck.class).name()
                        : text
                                + (deck.day().equals(scene.today())
                                        ? ", tonight"
                                        : ", on " + on(deck.day(), scene.today())),
                "A match",
                picture == null ? null : picture.url(),
                null,
                30));
    }

    private static String on(LocalDate day, LocalDate today) {
        return ChronoUnit.DAYS.between(today, day) < 7 ? Phrases.weekday(day) : Words.shortDay(day);
    }

    /** When an idea became a match: the moment the last yes was said. */
    private static Instant madeAt(Scene scene, EntryRow idea) {
        return scene.under(idea.id()).stream()
                .map(EntryRow::doneAt)
                .filter(Objects::nonNull)
                .max(Comparator.naturalOrder())
                .orElse(idea.createdAt());
    }
}
