package app.homeport.api.board.templates;

import app.homeport.api.board.BoardMedia;
import app.homeport.api.board.BoardRules;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.board.Words;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.media.MediaKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Where is it?: a list of where things were put, with a photo and a place, and "last seen" for the things
 * that wander.
 *
 * <p><b>Asking.</b> "where's the tent" is read by rules, not by a service: the little words are dropped
 * ({@link #keywords}), and what is left is looked for in the names of the things put away, then in their
 * places and notes ({@link #score}). The best match is the answer. The board answers through {@code show};
 * the circle's search answers the same question through {@link WhereIsItSearch}.
 *
 * <p><b>Who sees what.</b> It is decided in {@link #sees}, and only there. A thing can be kept to some people
 * (the spare key, the passports: the two grown-ups). Everyone else who sees the list is not told it is on
 * it: it isn't in the list, isn't counted, isn't found by a question or a search, and can't be changed by
 * its id. A thing kept to nobody in particular is there for everyone who sees the list.
 *
 * <p>Anyone who sees a thing may say where they last saw it.
 */
@Component
class WhereIsIt implements BoardRules {

    static final String ITEM = "item";

    private static final Set<String> LITTLE_WORDS = Set.of(
            "where",
            "wheres",
            "is",
            "are",
            "was",
            "were",
            "the",
            "a",
            "an",
            "my",
            "our",
            "your",
            "his",
            "her",
            "their",
            "did",
            "do",
            "does",
            "we",
            "i",
            "you",
            "put",
            "keep",
            "kept",
            "leave",
            "left",
            "have",
            "has",
            "had",
            "seen",
            "see",
            "anyone",
            "anybody",
            "find",
            "found",
            "can",
            "cant",
            "it",
            "they",
            "them",
            "that",
            "this",
            "those",
            "these",
            "of",
            "in",
            "on",
            "at",
            "to",
            "for",
            "and",
            "or",
            "again",
            "now",
            "please",
            "what",
            "happened",
            "go",
            "gone",
            "went",
            "last",
            "time");

    record WhereIsItSettings() {}

    /**
     * Something that was put away. The entry's columns hold the rest: {@code for_id} is who put it there and
     * {@code day} when, {@code media_id} the photo, {@code done_at} and {@code done_by} when and by whom it was
     * last seen.
     *
     * @param seen where it was last seen, in a few words: "on the hall hook"
     * @param only the members it is kept to. Empty: everyone who sees the list.
     */
    record Item(String name, String emoji, String place, String note, String seen, List<UUID> only) {
        Item {
            only = only == null ? List.of() : List.copyOf(only);
        }
    }

    record WhereIsItResponse(
            @Schema(nullable = true, description = "The question that was asked with `show`")
            String asked,

            @Schema(nullable = true, description = "What answers it. Null when nothing was asked, or nothing fits.")
            WhereIsItItemResponse found,

            @Schema(description = "Everything else put away that this person may see, newest first. 200 at most.")
            List<WhereIsItItemResponse> items,

            @Schema(description = "How many things are put away, of those this person may see")
            int count) {}

    record WhereIsItItemResponse(
            UUID id,
            String name,
            @Schema(nullable = true) String emoji,

            @Schema(description = "Where it is: Attic, blue crate 3")
            String place,

            @Schema(nullable = true, description = "What else to know: Tent, pegs and both mats.")
            String note,

            @Schema(nullable = true) BoardMedia photo,

            @Schema(nullable = true, description = "Who put it there")
            PersonBrief putBy,

            @Schema(nullable = true) LocalDate putOn,

            @Schema(nullable = true, description = "Where it was last seen since: on the hall hook")
            String seen,

            @Schema(nullable = true) PersonBrief seenBy,
            @Schema(nullable = true) Instant seenAt,

            @Schema(description = "The people it is kept to. Empty: everyone who sees the list.")
            List<PersonBrief> only,

            boolean mine) {}

    @Override
    public Template template() {
        return Template.WHERE_IS_IT;
    }

    @Override
    public Class<?> settingsType() {
        return WhereIsItSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return WhereIsItResponse.class;
    }

    @Override
    public Class<?> entryType() {
        return WhereIsItItemResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: none",
                "entry item: name, place, emoji, note, mediaId (a photo upload), putByMemberId (left out: you), day"
                        + " (when it was put there; left out: today), onlyMemberIds (the members it is kept to; left"
                        + " out or empty: everyone who sees the list). Changing its place forgets where it was last seen.",
                "verb seen: entryId, place (where you saw it), byMemberId (left out: you). Everyone who sees the"
                        + " thing may say so, also with a board they may only look at.",
                "show: a question or a few words (where's the tent). `found` is what answers it.");
    }

    @Override
    public boolean viewersMay(String verb) {
        return verb.equals("seen");
    }

    // ---------- asking ----------

    /** The words of a question that say what is looked for: "where's the tent" is "tent". */
    static List<String> keywords(String question) {
        if (question == null) {
            return List.of();
        }
        return Arrays.stream(question.toLowerCase(Locale.ROOT)
                        .replace("’", "'")
                        .replace("'s ", " ")
                        .replace("'", "")
                        .split("[^\\p{L}\\p{N}]+"))
                .filter(word -> word.length() > 1 && !LITTLE_WORDS.contains(word))
                .map(WhereIsIt::stem)
                .distinct()
                .toList();
    }

    /** "passports" and "passport" are the same word to a question. "Christmas", "bus" and "compass" stay whole. */
    private static String stem(String word) {
        return word.length() > 3 && word.endsWith("s") && !word.matches(".*[aius]s")
                ? word.substring(0, word.length() - 1)
                : word;
    }

    private static boolean has(String text, String keyword) {
        if (text == null) {
            return false;
        }
        return Arrays.stream(text.toLowerCase(Locale.ROOT).replace("’", "'").split("[^\\p{L}\\p{N}]+"))
                .map(WhereIsIt::stem)
                .anyMatch(word -> word.equals(keyword) || (keyword.length() >= 3 && word.startsWith(keyword)));
    }

    /** How well a thing answers a question: three for each word found in its name, one for each found in the rest. */
    static int score(List<String> keywords, String name, String rest) {
        int score = 0;
        for (String keyword : keywords) {
            score += has(name, keyword) ? 3 : has(rest, keyword) ? 1 : 0;
        }
        return score;
    }

    /** The thing that best answers a question, of those this person may see. Null when nothing fits. */
    static EntryRow answer(Scene scene, String question) {
        List<String> keywords = keywords(question);
        return scene.entries(ITEM).stream()
                .filter(row -> sees(scene, row))
                .filter(row -> score(keywords, row) > 0)
                .max(Comparator.comparingInt((EntryRow row) -> score(keywords, row))
                        .thenComparing(EntryRow::updatedAt))
                .orElse(null);
    }

    private static int score(List<String> keywords, EntryRow row) {
        Item item = row.as(Item.class);
        return score(keywords, item.name(), item.place() + " " + Objects.requireNonNullElse(item.note(), ""));
    }

    /** One line that answers: "Attic, blue crate 3 · Tent, pegs and both mats." */
    static String answerLine(EntryRow row) {
        Item item = row.as(Item.class);
        return item.place() + (item.note() == null ? "" : " · " + item.note());
    }

    // ---------- who sees what ----------

    /** The one place that decides whether a thing put away is there for this person. */
    static boolean sees(Scene scene, EntryRow row) {
        List<UUID> only = row.as(Item.class).only();
        return only.isEmpty() || (scene.me() != null && (only.contains(scene.myId()) || scene.isMe(row.authorId())));
    }

    private static EntryRow seen(Scene scene, EntryRow row) {
        if (!row.is(ITEM) || !sees(scene, row)) {
            throw Scene.entryGone(); // kept to others: for this person it isn't there
        }
        return row;
    }

    // ---------- settings ----------

    @Override
    public Object settings(Scene scene, Fields sent) {
        return new WhereIsItSettings();
    }

    // ---------- what a person sees ----------

    @Override
    public Object view(Scene scene, String show) {
        EntryRow found = show == null ? null : answer(scene, show);
        List<EntryRow> mine =
                scene.entries(ITEM).stream().filter(row -> sees(scene, row)).toList();
        return new WhereIsItResponse(
                show,
                found == null ? null : item(scene, found),
                mine.reversed().stream()
                        .filter(row -> found == null || !row.id().equals(found.id()))
                        .limit(200)
                        .map(row -> item(scene, row))
                        .toList(),
                mine.size());
    }

    /** A thing for someone who may see it: the caller asked {@link #sees} first. */
    private static WhereIsItItemResponse item(Scene scene, EntryRow row) {
        Item item = row.as(Item.class);
        return new WhereIsItItemResponse(
                row.id(),
                item.name(),
                item.emoji(),
                item.place(),
                item.note(),
                scene.media(row.mediaId()),
                scene.brief(row.forId()),
                row.day(),
                item.seen(),
                item.seen() == null ? null : scene.brief(row.doneBy()),
                item.seen() == null ? null : row.doneAt(),
                item.only().stream().map(scene::brief).filter(Objects::nonNull).toList(),
                scene.isMe(row.authorId()));
    }

    @Override
    public Object entry(Scene scene, EntryRow entry) {
        return entry.is(ITEM) && sees(scene, entry) ? item(scene, entry) : null;
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        if (!entry.is(ITEM) || !sees(scene, entry)) {
            return null;
        }
        Item item = entry.as(Item.class);
        return item.name() + " · " + answerLine(entry) + (item.seen() == null ? "" : " · last seen " + item.seen());
    }

    // ---------- changing it ----------

    private static List<UUID> only(Scene scene, Fields sent, List<UUID> now) {
        List<UUID> only = sent.ids("onlyMemberIds", 30);
        if (only == null) {
            return now;
        }
        only.forEach(scene::inCircle);
        // Whoever keeps it to some people is always one of them.
        List<UUID> kept = new ArrayList<>(only);
        if (!kept.isEmpty() && scene.myId() != null && !kept.contains(scene.myId())) {
            kept.add(scene.myId());
        }
        return kept;
    }

    private static Item item(Scene scene, Fields sent, Item now) {
        String name = sent.text("name", 120, now.name());
        String place = sent.text("place", 200, now.place());
        if (name == null) {
            throw ApiProblem.badRequest("missing_name", "Say what it is.");
        }
        if (place == null) {
            throw ApiProblem.badRequest("missing_place", "Say where it is.");
        }
        return new Item(
                name,
                sent.text("emoji", 16, now.emoji()),
                place,
                sent.text("note", 300, now.note()),
                place.equals(now.place()) ? now.seen() : null,
                only(scene, sent, now.only()));
    }

    private static LocalDate day(Scene scene, Fields sent, LocalDate otherwise) {
        LocalDate day = sent.day("day", otherwise);
        if (day == null || day.isAfter(scene.today())) {
            throw ApiProblem.badRequest("invalid_day", "Choose today or a day gone by.");
        }
        return day;
    }

    private static UUID who(Scene scene, UUID memberId) {
        if (memberId == null || scene.inCircle(memberId) == null) {
            throw ApiProblem.badRequest("missing_member", "Say who it was.");
        }
        return memberId;
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        if (!kind.equals(ITEM)) {
            throw BoardRules.unknownKind();
        }
        return scene.add(
                EntryDraft.of(ITEM)
                        .by(scene.myId())
                        .forMember(who(scene, sent.id("putByMemberId", scene.myId())))
                        .day(day(scene, sent, scene.today()))
                        .media(scene.upload(sent.id("mediaId"), MediaKind.PHOTO))
                        .doc(item(scene, sent, new Item(null, null, null, null, null, List.of()))),
                clientId);
    }

    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        Item now = seen(scene, entry).as(Item.class);
        Item next = item(scene, sent, now);
        EntryDraft draft = EntryDraft.from(entry).doc(next);
        if (!next.place().equals(now.place())) {
            // Put somewhere else: by this person, today, and where it was last seen no longer matters.
            draft.forMember(who(scene, sent.id("putByMemberId", scene.myId())))
                    .day(day(scene, sent, scene.today()))
                    .done(null, null);
        } else if (sent.has("putByMemberId") || sent.has("day")) {
            draft.forMember(who(scene, sent.id("putByMemberId", entry.forId()))).day(day(scene, sent, entry.day()));
        }
        if (sent.has("mediaId")) {
            draft.media(scene.upload(sent.id("mediaId"), MediaKind.PHOTO));
        }
        scene.save(entry, draft);
    }

    @Override
    public void remove(Scene scene, EntryRow entry) {
        scene.remove(seen(scene, entry).id());
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        if (!verb.equals("seen")) {
            throw BoardRules.unknownVerb();
        }
        EntryRow row = seen(scene, scene.need(sent.id("entryId")));
        Item item = row.as(Item.class);
        UUID by = who(scene, sent.id("byMemberId", scene.myId()));
        if (!scene.iStandInFor(by)) {
            throw ApiProblem.badRequest("not_yours_to_say", "You can say what you saw, or what a child of yours saw.");
        }
        scene.save(
                row,
                EntryDraft.from(row)
                        .done(scene.now(), by)
                        .doc(new Item(
                                item.name(),
                                item.emoji(),
                                item.place(),
                                item.note(),
                                sent.need("place", 200, "Say where you saw it."),
                                item.only())));
    }

    // ---------- what it brings to the rest ----------

    /** Counts only what this person may see. */
    @Override
    public String glance(Scene scene) {
        long count =
                scene.entries(ITEM).stream().filter(row -> sees(scene, row)).count();
        return Words.count(count, "thing") + " put away";
    }
}
