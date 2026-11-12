package app.homeport.api.board.templates;

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
import app.homeport.api.home.TodaySource.TodayItem;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.stereotype.Component;

/**
 * Tucked notes: a note that hides and waits, and turns up for the other person at a moment of its own.
 *
 * <p><b>When it turns up.</b> A note is tucked away in one of four ways:
 *
 * <ul>
 *   <li>{@code this_week}: the API picks a moment by itself, somewhere between an hour from now and the
 *       coming Sunday ({@link #window}). Neither of the two is told the moment: the writer is told only the
 *       day it will have turned up by.
 *   <li>{@code at}: a time the writer sets.
 *   <li>{@code lands} ("when he lands") and {@code rains} ("next time it rains"): these wait for a signal, from
 *       the reader's phone that it has arrived somewhere, or from a weather source. <b>Nothing sends either
 *       signal yet</b>, so such a note is kept and waits; its writer is told so, and can give it a time
 *       instead.
 * </ul>
 *
 * <p><b>Who sees what.</b> It is decided in {@link #sight}, and only there:
 *
 * <ul>
 *   <li>The writer reads their own note, always.
 *   <li>The person it is for gets nothing of it before its moment: not its words, not its id, not when it
 *       will come. It isn't on the board, in the list of entries, in a search or in the glance, and by its id
 *       it "isn't there". From its moment on they read it, and when they have, it is "found".
 *   <li>Anyone else never reads it.
 * </ul>
 *
 * One thing the person it is for is told before the moment, because the drawing of a couple's Today says
 * so: that a note is tucked away for them, and who by ("It turns up when it turns up"). That line carries
 * nothing of the note itself.
 *
 * <p>The moment is the API's clock, not the phone's: a phone set to next week finds nothing early.
 */
@Component
class TuckedNotes implements BoardRules {

    static final String NOTE = "note";
    static final String THIS_WEEK = "this_week";
    static final String AT = "at";
    static final String LANDS = "lands";
    static final String RAINS = "rains";
    private static final Set<String> WAYS = Set.of(THIS_WEEK, AT, LANDS, RAINS);
    private static final Set<String> WAITING = Set.of(LANDS, RAINS);

    record TuckedNotesSettings() {}

    /**
     * A note. The entry's columns hold the rest: {@code author_id} wrote it, {@code for_id} is who it is for,
     * {@code opens_at} the moment it turns up (none for one that waits for a signal), {@code done_at} when it
     * was found.
     *
     * @param turnsUp this_week, at, lands or rains
     * @param before for this_week: the day it will have turned up by
     */
    record Note(String text, String turnsUp, LocalDate before) {}

    /** What one person may know of one note. */
    enum Sight {
        /** It isn't there for them. */
        NOTHING,
        /** They wrote it. */
        WRITER,
        /** It is for them and its moment has come. */
        TURNED_UP
    }

    record TuckedNotesResponse(
            @Schema(description = "The notes this person tucked away that haven't been found yet, newest first")
            List<TuckedNotesNoteResponse> tucked,

            @Schema(description = "Notes for this person that have turned up and wait to be read")
            List<TuckedNotesNoteResponse> turnedUp,

            @Schema(description = "How many were found so far, of those this person wrote or was given")
            int found,

            @Schema(description = "The last five that were found, newest first. The list of entries has them all.")
            List<TuckedNotesNoteResponse> foundLately,

            @Schema(description = "Who a note can be tucked away for")
            List<PersonBrief> readers,

            @Schema(description = "The ways a note can turn up, and which of them work today")
            List<TuckedNotesWayResponse> ways) {}

    record TuckedNotesWayResponse(
            @Schema(description = "this_week, at, lands or rains")
            String way,

            @Schema(description = "False for a way that waits for a signal nothing sends yet")
            boolean works,

            @Schema(nullable = true, description = "For a way that doesn't work yet: what it is waiting for")
            String waitsFor) {}

    record TuckedNotesNoteResponse(
            UUID id,
            String text,
            @Schema(nullable = true) PersonBrief from,
            @Schema(nullable = true) PersonBrief forPerson,
            boolean mine,

            @Schema(description = "this_week, at, lands or rains")
            String turnsUp,

            @Schema(nullable = true, description = "The time its writer set. Null for every other way.")
            Instant at,

            @Schema(
                    nullable = true,
                    description = "For this_week, to its writer: the day it will have turned up by. The moment"
                            + " itself is told to nobody.")
            LocalDate before,

            @Schema(description = "True for a note that waits for a signal nothing sends yet")
            boolean waiting,

            boolean found,
            @Schema(nullable = true) Instant foundAt) {}

    @Override
    public Template template() {
        return Template.TUCKED_NOTES;
    }

    @Override
    public Class<?> settingsType() {
        return TuckedNotesSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return TuckedNotesResponse.class;
    }

    @Override
    public Class<?> entryType() {
        return TuckedNotesNoteResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: none",
                "entry note: text, forMemberId (left out between two people: the other one), turnsUp (this_week, at,"
                        + " lands or rains; left out: this_week), at (for turnsUp at: the moment, as"
                        + " 2026-11-13T19:30:00Z). lands and rains wait for a signal nothing sends yet.",
                "verb found: entryId. The person a note is for says they have read it, once it has turned up.",
                "Everyone who sees the board may tuck a note away and find theirs, also with a board they may only"
                        + " look at.");
    }

    @Override
    public boolean viewersMayWrite(String kind) {
        return kind.equals(NOTE);
    }

    @Override
    public boolean viewersMay(String verb) {
        return verb.equals("found");
    }

    // ---------- when it turns up ----------

    /**
     * The stretch of time "some time this week" picks from: from an hour from now to the start of the coming
     * Sunday. When that is less than half a day (it is Saturday evening, or Sunday), the Sunday after.
     *
     * @return the first and the last moment it can be
     */
    static List<Instant> window(Instant now) {
        Instant from = now.plus(Duration.ofHours(1));
        LocalDate sunday = from.atOffset(ZoneOffset.UTC).toLocalDate().with(TemporalAdjusters.next(DayOfWeek.SUNDAY));
        Instant to = sunday.atStartOfDay().toInstant(ZoneOffset.UTC);
        if (Duration.between(from, to).compareTo(Duration.ofHours(12)) < 0) {
            to = to.plus(Duration.ofDays(7));
        }
        return List.of(from, to);
    }

    private static boolean turnedUp(EntryRow note, Instant now) {
        return note.done() || (note.opensAt() != null && !note.opensAt().isAfter(now));
    }

    // ---------- who sees what ----------

    /** The one place that decides what a person may know of a note. */
    private static Sight sight(Scene scene, EntryRow note) {
        if (scene.me() == null || !note.is(NOTE)) {
            return Sight.NOTHING;
        }
        if (scene.isMe(note.authorId())) {
            return Sight.WRITER;
        }
        boolean forThem = note.forId() != null && scene.iStandInFor(note.forId());
        return forThem && turnedUp(note, scene.now()) ? Sight.TURNED_UP : Sight.NOTHING;
    }

    /**
     * The notes that are for this person, have a moment to come and haven't turned up: only ever counted, and
     * only for Today. One that waits for a signal nothing sends is left out, or the line would never go away.
     */
    private static List<EntryRow> waitingFor(Scene scene) {
        return scene.entries(NOTE).stream()
                .filter(note -> !scene.isMe(note.authorId())
                        && note.forId() != null
                        && scene.iStandInFor(note.forId())
                        && note.opensAt() != null
                        && !turnedUp(note, scene.now()))
                .toList();
    }

    // ---------- settings ----------

    @Override
    public Object settings(Scene scene, Fields sent) {
        return new TuckedNotesSettings();
    }

    // ---------- what a person sees ----------

    private static List<Person> others(Scene scene) {
        return scene.humans().stream()
                .filter(person -> !scene.isMe(person.id()))
                .toList();
    }

    @Override
    public Object view(Scene scene, String show) {
        List<EntryRow> notes = scene.entries(NOTE).stream()
                .filter(note -> sight(scene, note) != Sight.NOTHING)
                .sorted(Comparator.comparing(EntryRow::createdAt).reversed())
                .toList();
        List<EntryRow> found = notes.stream()
                .filter(EntryRow::done)
                .sorted(Comparator.comparing(EntryRow::doneAt).reversed())
                .toList();
        return new TuckedNotesResponse(
                notes.stream()
                        .filter(note -> !note.done() && sight(scene, note) == Sight.WRITER)
                        .map(note -> note(scene, note))
                        .toList(),
                notes.stream()
                        .filter(note -> !note.done() && sight(scene, note) == Sight.TURNED_UP)
                        .map(note -> note(scene, note))
                        .toList(),
                found.size(),
                found.stream().limit(5).map(note -> note(scene, note)).toList(),
                others(scene).stream().map(person -> scene.brief(person.id())).toList(),
                List.of(
                        new TuckedNotesWayResponse(THIS_WEEK, true, null),
                        new TuckedNotesWayResponse(AT, true, null),
                        new TuckedNotesWayResponse(
                                LANDS,
                                false,
                                "A sign from their phone that they have arrived. Phones don't send it yet."),
                        new TuckedNotesWayResponse(
                                RAINS, false, "A weather source to say that it is raining. None is connected yet.")));
    }

    /** A note for someone who may read it: the caller asked {@link #sight} first. */
    private static TuckedNotesNoteResponse note(Scene scene, EntryRow row) {
        Note note = row.as(Note.class);
        boolean writer = scene.isMe(row.authorId());
        return new TuckedNotesNoteResponse(
                row.id(),
                note.text(),
                scene.brief(row.authorId()),
                scene.brief(row.forId()),
                writer,
                note.turnsUp(),
                AT.equals(note.turnsUp()) ? row.opensAt() : null,
                writer && !row.done() ? note.before() : null,
                !row.done() && WAITING.contains(note.turnsUp()),
                row.done(),
                row.doneAt());
    }

    @Override
    public Object entry(Scene scene, EntryRow entry) {
        return sight(scene, entry) == Sight.NOTHING ? null : note(scene, entry);
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        return sight(scene, entry) == Sight.NOTHING
                ? null
                : entry.as(Note.class).text();
    }

    // ---------- changing it ----------

    /** Sets when a note turns up: picks the moment for this week, takes the time that was set, or lets it wait. */
    private static EntryDraft timed(Scene scene, EntryDraft draft, String text, String way, Instant at) {
        if (!WAYS.contains(way)) {
            throw ApiProblem.badRequest(
                    "invalid_way",
                    "Choose when it turns up: some time this week, at a time, when they land, or when it rains.");
        }
        return switch (way) {
            case THIS_WEEK -> {
                List<Instant> window = window(scene.now());
                long seconds = Duration.between(window.get(0), window.get(1)).toSeconds();
                yield draft.opensAt(window.get(0)
                                .plusSeconds(ThreadLocalRandom.current().nextLong(seconds)))
                        .doc(new Note(
                                text,
                                way,
                                window.get(1).atOffset(ZoneOffset.UTC).toLocalDate()));
            }
            case AT -> {
                if (at == null || at.isBefore(scene.now())) {
                    throw ApiProblem.badRequest("invalid_moment", "Choose a time that is still to come.");
                }
                yield draft.opensAt(at).doc(new Note(text, way, null));
            }
            default -> draft.opensAt(null).doc(new Note(text, way, null));
        };
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        if (!kind.equals(NOTE)) {
            throw BoardRules.unknownKind();
        }
        List<Person> others = others(scene);
        UUID reader = scene.inCircle(
                sent.id("forMemberId", others.size() == 1 ? others.get(0).id() : null));
        if (reader == null || scene.isMe(reader) || scene.person(reader).kind() == MemberKind.PET) {
            throw ApiProblem.badRequest("missing_reader", "Choose who the note is for.");
        }
        return scene.add(
                timed(
                        scene,
                        EntryDraft.of(NOTE).by(scene.myId()).forMember(reader),
                        sent.need("text", 1000, "Write the note first."),
                        Objects.requireNonNullElse(sent.text("turnsUp", 20), THIS_WEEK),
                        Phrases.instant(sent.text("at", 40))),
                clientId);
    }

    private static ApiProblem theirsNow() {
        return ApiProblem.conflict("turned_up", "It has turned up. It is theirs now.");
    }

    /** Its writer changes a note, or when it turns up, until it has turned up. */
    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        if (sight(scene, entry) != Sight.WRITER) {
            throw Scene.entryGone(); // for anyone but its writer there is nothing to change
        }
        if (turnedUp(entry, scene.now())) {
            throw theirsNow();
        }
        Note now = entry.as(Note.class);
        String text = sent.text("text", 1000, now.text());
        if (text == null) {
            throw ApiProblem.badRequest("missing_text", "Write the note first.");
        }
        if (sent.has("turnsUp") || sent.has("at")) {
            Instant at = sent.has("at") ? Phrases.instant(sent.text("at", 40)) : entry.opensAt();
            scene.save(
                    entry,
                    timed(
                            scene,
                            EntryDraft.from(entry),
                            text,
                            Objects.requireNonNullElse(sent.text("turnsUp", 20), AT),
                            at));
        } else {
            scene.save(entry, EntryDraft.from(entry).doc(new Note(text, now.turnsUp(), now.before())));
        }
    }

    /** Its writer takes a note back until it has turned up; after that it is the reader's to keep or throw away. */
    @Override
    public void remove(Scene scene, EntryRow entry) {
        switch (sight(scene, entry)) {
            case NOTHING -> throw Scene.entryGone();
            case WRITER -> {
                if (turnedUp(entry, scene.now())) {
                    throw theirsNow();
                }
                scene.remove(entry.id());
            }
            case TURNED_UP -> scene.remove(entry.id());
        }
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        if (!verb.equals("found")) {
            throw BoardRules.unknownVerb();
        }
        EntryRow note = scene.need(sent.id("entryId"));
        switch (sight(scene, note)) {
            case NOTHING -> throw Scene.entryGone(); // not turned up yet: for its reader it isn't there
            case WRITER -> throw ApiProblem.conflict("not_for_you", "You wrote this one. It is for them to find.");
            case TURNED_UP -> {
                if (!note.done()) {
                    scene.save(note, EntryDraft.from(note).done(scene.now(), scene.myId()));
                }
            }
        }
    }

    // ---------- what it brings to the rest ----------

    /** Counts only what this person may read, and their own notes still tucked away. Never what waits for them. */
    @Override
    public String glance(Scene scene) {
        List<EntryRow> mine = scene.entries(NOTE).stream()
                .filter(note -> sight(scene, note) != Sight.NOTHING)
                .toList();
        long found = mine.stream().filter(EntryRow::done).count();
        long tucked = mine.stream()
                .filter(note -> !note.done() && sight(scene, note) == Sight.WRITER)
                .count();
        return found + " found so far" + (tucked == 0 ? "" : " · " + tucked + " tucked away");
    }

    @Override
    public List<TodayItem> today(Scene scene) {
        List<TodayItem> items = new ArrayList<>();
        // What has turned up and wasn't read yet: one line each.
        scene.entries(NOTE).stream()
                .filter(note -> !note.done() && sight(scene, note) == Sight.TURNED_UP)
                .forEach(note -> items.add(new TodayItem(
                        scene.boardId(),
                        ThingKind.BOARD,
                        "A note from " + scene.firstName(note.authorId()) + " has turned up",
                        "Open it to read it.",
                        null,
                        null,
                        1440,
                        scene.avatars(note.authorId()))));
        // What is still hidden: that it is there and who by, and nothing else.
        List<EntryRow> waiting = waitingFor(scene);
        if (!waiting.isEmpty()) {
            List<UUID> writers = waiting.stream()
                    .map(EntryRow::authorId)
                    .filter(Objects::nonNull)
                    .distinct()
                    .toList();
            items.add(new TodayItem(
                    scene.boardId(),
                    ThingKind.BOARD,
                    waiting.size() == 1
                            ? "A note is tucked away for you"
                            : Words.count(waiting.size(), "note") + " are tucked away for you",
                    (writers.isEmpty()
                                    ? ""
                                    : "From "
                                            + Phrases.list(writers.stream()
                                                    .map(scene::firstName)
                                                    .toList())
                                            + ". ")
                            + (waiting.size() == 1
                                    ? "It turns up when it turns up."
                                    : "They turn up when they turn up."),
                    null,
                    null,
                    1440,
                    scene.avatars(writers.toArray(UUID[]::new))));
        }
        return items;
    }
}
