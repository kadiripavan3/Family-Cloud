package app.homeport.api.board.templates;

import app.homeport.api.board.BoardMedia;
import app.homeport.api.board.BoardRules;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.board.Words;
import app.homeport.api.circle.MemberKind;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.home.TodaySource.FreshCard;
import app.homeport.api.media.MediaKind;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Open when…: letters that open at a moment the reader chooses ("open when you can't sleep"), once.
 *
 * <p><b>Who sees what.</b> It is decided in {@link #reads}, and only there:
 *
 * <ul>
 *   <li>Everyone who sees the board sees the envelopes: what each says on the outside, who it is from, whether
 *       it has a voice message, and when it was opened.
 *   <li>The writer reads their own letter, always, and may change it until it is opened.
 *   <li>The reader reads a letter from the moment they open it, and then for good. Nobody opens it for them,
 *       unless the reader is a child with no sign-in of their own: then one of the adults who look after them
 *       opens it, on their phone, with the child, and those adults can read it afterwards.
 *   <li>Anyone else never reads it, opened or not.
 * </ul>
 *
 * A letter is opened once. The moment is kept, and the writer hears of it.
 */
@Component
class OpenWhen implements BoardRules {

    static final String LETTER = "letter";

    record OpenWhenSettings(
            @Schema(description = "The member the letters are for")
            UUID forMemberId) {}

    /** @param when what the envelope says after "Open when…"; text is inside */
    record Letter(String when, String emoji, String text, String forwardOn) {}

    record OpenWhenView(
            @Schema(nullable = true) PersonBrief forPerson,

            @Schema(description = "True when the letters are for the person looking")
            boolean youAreTheReader,

            @Schema(
                    description =
                            "True when this person opens letters with the reader, who has no sign-in of their own")
            boolean youOpenForThem,

            int sealed,
            int opened,
            List<OpenWhenLetter> letters) {}

    record OpenWhenLetter(
            UUID id,

            @Schema(description = "What the envelope says after “Open when…”: you can't sleep")
            String when,

            @Schema(nullable = true) String emoji,
            @Schema(nullable = true) PersonBrief from,
            boolean mine,
            boolean opened,
            @Schema(nullable = true) Instant openedAt,

            @Schema(nullable = true, description = "Who pressed open: the reader, or an adult with them")
            PersonBrief openedBy,

            boolean hasVoice,

            @Schema(nullable = true, description = "journey: it comes forward when the reader is on a journey")
            String forwardOn,

            @Schema(description = "True when this person may open it now")
            boolean canOpen,

            @Schema(nullable = true, description = "The letter. Null for everyone who may not read it.")
            String text,

            @Schema(nullable = true, description = "The voice message. Null for everyone who may not hear it.")
            BoardMedia voice) {}

    @Override
    public Template template() {
        return Template.OPEN_WHEN;
    }

    @Override
    public Class<?> settingsType() {
        return OpenWhenSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return OpenWhenView.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: forMemberId (who the letters are for)",
                "entry letter: when (what the envelope says), emoji, text, mediaId (an audio upload), forwardOn"
                        + " (journey, or null)",
                "verb open: entryId. The reader opens it, once; someone who may only look at the board may too.");
    }

    // ---------- who sees what ----------

    /** The one place that decides who reads a letter. */
    private static boolean reads(Scene scene, EntryRow letter) {
        if (scene.isMe(letter.authorId())) {
            return true;
        }
        return letter.done() && letter.forId() != null && scene.iStandInFor(letter.forId());
    }

    /** True when this person may open the letter now: it is for them (or for the child they look after) and still sealed. */
    private static boolean mayOpen(Scene scene, EntryRow letter) {
        return !letter.done() && letter.forId() != null && scene.iStandInFor(letter.forId());
    }

    @Override
    public boolean viewersMay(String verb) {
        return verb.equals("open");
    }

    // ---------- settings ----------

    @Override
    public Object settings(Scene scene, Fields sent) {
        UUID now = scene.isNew() ? null : scene.settings(OpenWhenSettings.class).forMemberId();
        UUID reader = scene.inCircle(sent.id("forMemberId", now));
        if (reader == null || scene.person(reader).kind() == MemberKind.PET) {
            throw ApiProblem.badRequest("missing_reader", "Choose who the letters are for.");
        }
        if (now != null && !now.equals(reader) && !scene.entries().isEmpty()) {
            throw ApiProblem.conflict(
                    "has_letters", "There are letters in here already. Start another one for someone else.");
        }
        return new OpenWhenSettings(reader);
    }

    // ---------- what a person sees ----------

    @Override
    public Object view(Scene scene, String show) {
        UUID reader = scene.settings(OpenWhenSettings.class).forMemberId();
        List<EntryRow> letters = scene.entries(LETTER);
        return new OpenWhenView(
                scene.brief(reader),
                scene.isMe(reader),
                !scene.isMe(reader) && scene.iStandInFor(reader),
                (int) letters.stream().filter(l -> !l.done()).count(),
                (int) letters.stream().filter(EntryRow::done).count(),
                letters.stream().map(l -> letter(scene, l)).toList());
    }

    private static OpenWhenLetter letter(Scene scene, EntryRow row) {
        Letter letter = row.as(Letter.class);
        boolean reads = reads(scene, row);
        return new OpenWhenLetter(
                row.id(),
                letter.when(),
                letter.emoji(),
                scene.brief(row.authorId()),
                scene.isMe(row.authorId()),
                row.done(),
                row.doneAt(),
                scene.brief(row.doneBy()),
                row.mediaId() != null,
                letter.forwardOn(),
                mayOpen(scene, row),
                reads ? letter.text() : null,
                reads ? scene.media(row.mediaId()) : null);
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        Letter letter = entry.as(Letter.class);
        // The envelope is there for everyone who sees the board; the words only for who may read them.
        return "Open when " + letter.when()
                + (reads(scene, entry) && letter.text() != null ? " · " + letter.text() : "");
    }

    // ---------- changing it ----------

    private static Letter letter(Fields sent, Letter now, boolean hasVoice) {
        String when = sent.text("when", 120, now.when());
        if (when == null) {
            throw ApiProblem.badRequest("missing_when", "Write when to open it: “you can't sleep”.");
        }
        String text = sent.text("text", 20000, now.text());
        if (text == null && !hasVoice) {
            throw ApiProblem.badRequest("missing_text", "Write the letter, or record a message.");
        }
        String forwardOn = sent.text("forwardOn", 20, now.forwardOn());
        if (forwardOn != null && !forwardOn.equals("journey")) {
            throw ApiProblem.badRequest("invalid_forward", "A letter can come forward on a journey, or not at all.");
        }
        return new Letter(when, sent.text("emoji", 16, now.emoji()), text, forwardOn);
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        if (!kind.equals(LETTER)) {
            throw BoardRules.unknownKind();
        }
        UUID voice = scene.upload(sent.id("mediaId"), MediaKind.AUDIO);
        return scene.add(
                EntryDraft.of(LETTER)
                        .by(scene.myId())
                        .forMember(scene.settings(OpenWhenSettings.class).forMemberId())
                        .media(voice)
                        .doc(letter(sent, new Letter(null, null, null, null), voice != null)),
                clientId);
    }

    private static ApiProblem kept() {
        return ApiProblem.conflict("opened", "It has been opened. Once opened, a letter is kept as it is.");
    }

    /** Only its writer changes a letter, and only until it is opened. */
    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        if (!scene.isMe(entry.authorId())) {
            throw BoardRules.notYours();
        }
        if (entry.done()) {
            throw kept();
        }
        UUID voice = sent.has("mediaId") ? scene.upload(sent.id("mediaId"), MediaKind.AUDIO) : entry.mediaId();
        scene.save(entry, EntryDraft.from(entry).media(voice).doc(letter(sent, entry.as(Letter.class), voice != null)));
    }

    /** Its writer can take a letter back until it is opened. After that it is the reader's to keep. */
    @Override
    public void remove(Scene scene, EntryRow entry) {
        if (!scene.isMe(entry.authorId())) {
            throw BoardRules.notYours();
        }
        if (entry.done()) {
            throw kept();
        }
        scene.remove(entry.id());
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        if (!verb.equals("open")) {
            throw BoardRules.unknownVerb();
        }
        EntryRow letter = scene.need(sent.id("entryId"));
        if (letter.done()) {
            return; // opened once; opening it again changes nothing
        }
        if (!mayOpen(scene, letter)) {
            throw new ApiProblem(
                    org.springframework.http.HttpStatus.FORBIDDEN,
                    "not_yours_to_open",
                    "Only " + scene.firstName(letter.forId()) + " can open this one.");
        }
        scene.save(letter, EntryDraft.from(letter).done(scene.now(), scene.myId()));
    }

    // ---------- what it brings to the rest ----------

    @Override
    public String glance(Scene scene) {
        List<EntryRow> letters = scene.entries(LETTER);
        long opened = letters.stream().filter(EntryRow::done).count();
        return Words.count(letters.size(), "letter") + (opened == 0 ? "" : " · " + opened + " opened");
    }

    /** The writer hears when one of their letters was opened. */
    @Override
    public List<FreshCard> fresh(Scene scene) {
        Instant since = scene.now().minus(Duration.ofDays(7));
        return scene.entries(LETTER).stream()
                .filter(l -> l.done() && l.doneAt().isAfter(since))
                .filter(l -> scene.isMe(l.authorId()) && !scene.isMe(l.doneBy()))
                .map(l -> new FreshCard(
                        scene.boardId(),
                        ThingKind.BOARD,
                        "Open when " + l.as(Letter.class).when(),
                        scene.firstName(l.forId()) + " opened it on "
                                + Words.shortDay(
                                        l.doneAt().atOffset(ZoneOffset.UTC).toLocalDate()),
                        null,
                        null))
                .toList();
    }
}
