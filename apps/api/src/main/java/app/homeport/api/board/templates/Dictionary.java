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
import app.homeport.api.home.TodaySource.FreshCard;
import app.homeport.api.media.MediaKind;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The dictionary: the words only this crew understands, each with what it means, who coined it, and where it
 * came from.
 *
 * <p>The newest word comes first. The board carries the count and the newest fifty; the rest is read a page
 * at a time, also by words (the entries route with {@code q}). A word that is new this week is told to the
 * crew on Today.
 *
 * <p>Nothing here is secret: everyone who sees the board reads every word.
 */
@Component
class Dictionary implements BoardRules {

    static final String WORD = "word";

    record DictionarySettings() {}

    /**
     * @param part what kind of word it is, in the crew's words: verb, noun
     * @param origin where it came from: "Lisbon airport", "every trip since 2019"
     * @param byName who coined it, when that is someone who isn't in the circle
     */
    record Word(String word, String part, String meaning, String origin, String seeAlso, String byName) {}

    record DictionaryViewResponse(
            int total,

            @Schema(description = "The newest fifty words. The rest is read a page at a time.")
            List<DictionaryWordResponse> words) {}

    record DictionaryWordResponse(
            UUID id,
            String word,

            @Schema(nullable = true, description = "What kind of word: verb, noun")
            String part,

            String meaning,

            @Schema(nullable = true, description = "Who coined it, also after they left the circle")
            PersonBrief coinedBy,

            @Schema(nullable = true, description = "Who coined it, when that is someone outside the circle")
            String coinedByName,

            @Schema(description = "True when the viewer coined it")
            boolean you,

            @Schema(nullable = true, description = "Where it came from: Lisbon airport")
            String origin,

            @Schema(nullable = true, description = "The day it was first recorded")
            LocalDate firstRecorded,

            @Schema(nullable = true, description = "Another word to look up: just one more plate")
            String seeAlso,

            @Schema(nullable = true) BoardMedia photo,
            Instant addedAt,
            boolean mine) {}

    @Override
    public Template template() {
        return Template.DICTIONARY;
    }

    @Override
    public Class<?> settingsType() {
        return DictionarySettings.class;
    }

    @Override
    public Class<?> viewType() {
        return DictionaryViewResponse.class;
    }

    @Override
    public Class<?> entryType() {
        return DictionaryWordResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: none",
                "entry word: word, meaning, part (verb, noun…), coinedByMemberId (or coinedByName; left out: you),"
                        + " origin (where it came from), firstRecorded (a date), seeAlso, mediaId (a photo upload)",
                "entries list: q (words), member (who coined it)");
    }

    @Override
    public int ceiling() {
        return 5000;
    }

    @Override
    public Object settings(Scene scene, Fields sent) {
        return new DictionarySettings();
    }

    private static List<EntryRow> newestFirst(Scene scene) {
        return scene.entries(WORD).stream()
                .sorted(Comparator.comparingDouble(EntryRow::position)
                        .thenComparing(EntryRow::id)
                        .reversed())
                .toList();
    }

    @Override
    public Object view(Scene scene, String show) {
        List<EntryRow> words = newestFirst(scene);
        return new DictionaryViewResponse(
                words.size(), words.stream().limit(50).map(w -> word(scene, w)).toList());
    }

    @Override
    public Object entry(Scene scene, EntryRow entry) {
        return entry.is(WORD) ? word(scene, entry) : null;
    }

    private static DictionaryWordResponse word(Scene scene, EntryRow row) {
        Word word = row.as(Word.class);
        return new DictionaryWordResponse(
                row.id(),
                word.word(),
                word.part(),
                word.meaning(),
                scene.brief(row.forId()),
                word.byName(),
                scene.isMe(row.forId()),
                word.origin(),
                row.day(),
                word.seeAlso(),
                scene.media(row.mediaId()),
                row.createdAt(),
                scene.isMe(row.authorId()));
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        if (!entry.is(WORD)) {
            return null;
        }
        Word word = entry.as(Word.class);
        return word.word() + " · " + word.meaning()
                + (word.origin() == null ? "" : " · " + word.origin())
                + (word.seeAlso() == null ? "" : " · " + word.seeAlso());
    }

    // ---------- changing it ----------

    private static Word word(Fields sent, Word now) {
        String word = sent.text("word", 80, now.word());
        String meaning = sent.text("meaning", 500, now.meaning());
        if (word == null || meaning == null) {
            throw ApiProblem.badRequest("missing_word", "Write the word, and what it means.");
        }
        return new Word(
                word,
                sent.text("part", 30, now.part()),
                meaning,
                sent.text("origin", 160, now.origin()),
                sent.text("seeAlso", 80, now.seeAlso()),
                sent.text("coinedByName", 50, now.byName()));
    }

    private static LocalDate firstRecorded(Scene scene, Fields sent, LocalDate otherwise) {
        LocalDate day = sent.day("firstRecorded", otherwise);
        if (day != null && day.isAfter(scene.today())) {
            throw ApiProblem.badRequest("invalid_day", "The day it was first recorded can't be after today.");
        }
        return day;
    }

    /** Who coined it: someone of the circle, also someone who has left, or a name. */
    private static UUID coinedBy(Scene scene, UUID memberId) {
        if (memberId != null && scene.person(memberId) == null) {
            throw ApiProblem.badRequest("not_in_circle", "Choose someone from this circle, or write their name.");
        }
        return memberId;
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        if (!kind.equals(WORD)) {
            throw BoardRules.unknownKind();
        }
        Word word = word(sent, new Word(null, null, null, null, null, null));
        UUID by = sent.has("coinedByMemberId") || word.byName() != null
                ? coinedBy(scene, sent.id("coinedByMemberId"))
                : scene.myId();
        return scene.add(
                EntryDraft.of(WORD)
                        .by(scene.myId())
                        .forMember(by)
                        .day(firstRecorded(scene, sent, null))
                        .position(scene.positionOn(scene.today()))
                        .media(scene.upload(sent.id("mediaId"), MediaKind.PHOTO))
                        .doc(word),
                clientId);
    }

    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        if (!entry.is(WORD)) {
            throw BoardRules.unknownKind();
        }
        EntryDraft draft = EntryDraft.from(entry)
                .forMember(coinedBy(scene, sent.id("coinedByMemberId", entry.forId())))
                .day(firstRecorded(scene, sent, entry.day()))
                .doc(word(sent, entry.as(Word.class)));
        if (sent.has("mediaId")) {
            draft.media(scene.upload(sent.id("mediaId"), MediaKind.PHOTO));
        }
        scene.save(entry, draft);
    }

    // ---------- what it brings to the rest ----------

    @Override
    public String glance(Scene scene) {
        List<EntryRow> words = newestFirst(scene);
        return words.isEmpty()
                ? "No words yet"
                : Words.count(words.size(), "word") + " · newest: "
                        + words.get(0).as(Word.class).word();
    }

    /** The newest word, for a week after it was written down. */
    @Override
    public List<FreshCard> fresh(Scene scene) {
        Instant since = scene.now().minus(Duration.ofDays(7));
        return newestFirst(scene).stream()
                .filter(w -> w.createdAt().isAfter(since))
                .limit(1)
                .map(w -> {
                    BoardMedia photo = scene.media(w.mediaId());
                    return new FreshCard(
                            scene.boardId(),
                            ThingKind.BOARD,
                            "New word",
                            "“" + w.as(Word.class).word() + "”",
                            photo == null ? null : photo.url(),
                            null);
                })
                .toList();
    }
}
