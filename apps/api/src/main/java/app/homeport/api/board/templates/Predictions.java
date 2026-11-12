package app.homeport.api.board.templates;

import app.homeport.api.board.BoardRules;
import app.homeport.api.board.EntryDraft;
import app.homeport.api.board.EntryRow;
import app.homeport.api.board.Fields;
import app.homeport.api.board.Scene;
import app.homeport.api.board.Template;
import app.homeport.api.board.Words;
import app.homeport.api.common.ApiProblem;
import app.homeport.api.home.TodaySource.TodayItem;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Predictions: everyone writes one about each of the others, they are sealed until a day years away, and on
 * that day they open together and the crew says who was right.
 *
 * <p><b>Who sees what.</b> It is decided in {@link #sight}, and only there:
 *
 * <ul>
 *   <li>A prediction that isn't sealed yet is its writer's alone. Nobody else is told it exists.
 *   <li>Once sealed, nobody reads it before the day, its writer included. What everyone sees is the envelope:
 *       who wrote it, who it is about, and when it was sealed. That is how the board can say "Lea has written
 *       all four" and "one to go: about Kai". The words don't leave the API, and neither does their length.
 *   <li>From the day on, everyone who sees the board reads all of them, and marks each one right or wrong.
 *       A prediction counts as right when more people said right than wrong. Nobody marks their own.
 * </ul>
 *
 * <p>The day is the viewer's own day, but never more than a day from the API's (see {@code Today}): a phone
 * set to 2035 opens nothing. Sealed means sealed: a sealed prediction can't be changed, and the day can't be
 * moved once one is sealed. Its writer can still take it out, unread.
 */
@Component
class Predictions implements BoardRules {

    static final String PREDICTION = "prediction";
    static final String MARK = "mark";

    // ---------- what is stored ----------

    record PredictionsSettings(
            @Schema(description = "The day they open") LocalDate opensOn,

            @Schema(nullable = true, description = "What the day is, in the crew's words: the reunion")
            String occasion) {}

    /** The entry's author wrote it; the entry is for the person it is about. */
    record Prediction(String text) {}

    record Mark(boolean right) {}

    // ---------- who sees what ----------

    /** What one person may know of one prediction. */
    enum Sight {
        /** It isn't there for them: someone else's, not sealed yet. */
        NOTHING,
        /** Their own, not sealed yet: they read and change it. */
        DRAFT,
        /** Sealed: who wrote it and about whom, nothing more. */
        ENVELOPE,
        /** The day has come: everything. */
        OPEN
    }

    private static boolean open(Scene scene) {
        return !scene.today().isBefore(scene.settings(PredictionsSettings.class).opensOn());
    }

    /** The one place that decides what a person may know of a prediction. */
    private static Sight sight(Scene scene, EntryRow prediction) {
        if (!prediction.done()) {
            return scene.isMe(prediction.authorId()) ? Sight.DRAFT : Sight.NOTHING;
        }
        return open(scene) ? Sight.OPEN : Sight.ENVELOPE;
    }

    // ---------- what a person sees ----------

    record PredictionsViewResponse(
            LocalDate opensOn,
            @Schema(nullable = true) String occasion,

            @Schema(description = "True from the day they open")
            boolean open,

            long daysToGo,

            @Schema(description = "Everyone who writes, with how far each has got")
            List<PredictionsWriterResponse> writers,

            @Schema(
                    description = "Every prediction this person may know of: sealed ones as envelopes, their own"
                            + " drafts, and from the day on all of them in full")
            List<PredictionsItemResponse> items) {}

    record PredictionsWriterResponse(
            PersonBrief person,
            boolean you,

            @Schema(description = "How many they have written. For others: only the sealed ones.")
            int written,

            @Schema(description = "How many there are to write: one about each of the others")
            int of,

            @Schema(description = "For the viewer: how many of theirs aren't sealed yet. 0 for everyone else.")
            int drafts,

            @Schema(description = "For the viewer: who they haven't written about yet. Empty for everyone else.")
            List<PersonBrief> stillAbout) {}

    record PredictionsItemResponse(
            UUID id,
            @Schema(nullable = true) PersonBrief by,
            @Schema(nullable = true) PersonBrief about,
            boolean mine,

            @Schema(description = "True for the viewer's own, not sealed yet")
            boolean draft,

            @Schema(description = "True while this person may not read it")
            boolean sealed,

            @Schema(nullable = true) Instant sealedAt,

            @Schema(nullable = true, description = "The words. Null while it is sealed for this person.")
            String text,

            @Schema(description = "How many said it came true. 0 until they open.")
            int right,

            @Schema(description = "How many said it didn't. 0 until they open.")
            int wrong,

            @Schema(nullable = true, description = "right or wrong, once more people said one than the other")
            String verdict,

            @Schema(nullable = true, description = "What this person said: true for right, false for wrong")
            Boolean yourMark) {}

    @Override
    public Template template() {
        return Template.PREDICTIONS;
    }

    @Override
    public Class<?> settingsType() {
        return PredictionsSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return PredictionsViewResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: opensOn (a date after today), occasion (words: the reunion)",
                "entry prediction: aboutMemberId, text, seal (left out: true; false keeps it a draft only you see)."
                        + " One about each of the others. Changing: text, seal, while it is your own draft.",
                "verb seal: entryId (your own draft; left out: all your drafts)",
                "verb mark: predictionId, right (true, false, or null to take it back). From the day they open.");
    }

    @Override
    public boolean viewersMayWrite(String kind) {
        return kind.equals(PREDICTION);
    }

    @Override
    public boolean viewersMay(String verb) {
        return verb.equals("seal") || verb.equals(MARK);
    }

    @Override
    public Object settings(Scene scene, Fields sent) {
        PredictionsSettings now =
                scene.isNew() ? new PredictionsSettings(null, null) : scene.settings(PredictionsSettings.class);
        LocalDate opensOn = sent.day("opensOn", now.opensOn());
        boolean moved = !Objects.equals(opensOn, now.opensOn());
        if (!scene.isNew() && moved && scene.entries(PREDICTION).stream().anyMatch(EntryRow::done)) {
            throw ApiProblem.conflict("sealed", "One is sealed already. The day they open can't change now.");
        }
        if (opensOn == null || (moved && !opensOn.isAfter(scene.today()))) {
            throw ApiProblem.badRequest("invalid_day", "Choose the day they open. It has to be after today.");
        }
        return new PredictionsSettings(opensOn, sent.text("occasion", 80, now.occasion()));
    }

    // ---------- what a person sees ----------

    @Override
    public Object view(Scene scene, String show) {
        PredictionsSettings settings = scene.settings(PredictionsSettings.class);
        List<EntryRow> all = scene.entries(PREDICTION);
        List<UUID> writers = Say.voiceIds(scene);
        List<PredictionsWriterResponse> rows = new ArrayList<>();
        for (UUID writer : writers) {
            boolean me = scene.isMe(writer);
            List<EntryRow> theirs = all.stream()
                    .filter(p -> writer.equals(p.authorId()) && sight(scene, p) != Sight.NOTHING)
                    .toList();
            rows.add(new PredictionsWriterResponse(
                    scene.brief(writer),
                    me,
                    theirs.size(),
                    writers.size() - 1,
                    me ? (int) theirs.stream().filter(p -> !p.done()).count() : 0,
                    me
                            ? writers.stream()
                                    .filter(other -> !other.equals(writer)
                                            && theirs.stream().noneMatch(p -> other.equals(p.forId())))
                                    .map(scene::brief)
                                    .toList()
                            : List.of()));
        }
        return new PredictionsViewResponse(
                settings.opensOn(),
                settings.occasion(),
                open(scene),
                Math.max(0, ChronoUnit.DAYS.between(scene.today(), settings.opensOn())),
                rows,
                all.stream().map(p -> item(scene, p)).filter(Objects::nonNull).toList());
    }

    /** One prediction as this person may see it, or null when it isn't there for them. */
    private static PredictionsItemResponse item(Scene scene, EntryRow row) {
        Sight sight = sight(scene, row);
        if (sight == Sight.NOTHING) {
            return null;
        }
        boolean reads = sight == Sight.OPEN || sight == Sight.DRAFT;
        List<EntryRow> marks = sight == Sight.OPEN
                ? scene.under(row.id()).stream().filter(e -> e.is(MARK)).toList()
                : List.of();
        int right = (int) marks.stream().filter(m -> m.as(Mark.class).right()).count();
        int wrong = marks.size() - right;
        return new PredictionsItemResponse(
                row.id(),
                scene.brief(row.authorId()),
                scene.brief(row.forId()),
                scene.isMe(row.authorId()),
                sight == Sight.DRAFT,
                !reads,
                row.doneAt(),
                reads ? row.as(Prediction.class).text() : null,
                right,
                wrong,
                right > wrong ? "right" : wrong > right ? "wrong" : null,
                marks.stream()
                        .filter(m -> scene.isMe(m.authorId()))
                        .map(m -> m.as(Mark.class).right())
                        .findFirst()
                        .orElse(null));
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        if (!entry.is(PREDICTION)) {
            return null;
        }
        return switch (sight(scene, entry)) {
            case DRAFT, OPEN -> entry.as(Prediction.class).text();
            case NOTHING, ENVELOPE -> null;
        };
    }

    // ---------- changing it ----------

    private static ApiProblem sealed() {
        return ApiProblem.conflict("sealed", "Sealed means sealed. It can't be read or changed before the day.");
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        if (!kind.equals(PREDICTION)) {
            throw BoardRules.unknownKind();
        }
        if (open(scene)) {
            throw ApiProblem.conflict("opened", "They have opened. Start a new round for the next ones.");
        }
        List<UUID> writers = Say.voiceIds(scene);
        if (scene.myId() == null || !writers.contains(scene.myId())) {
            throw BoardRules.notYours();
        }
        UUID about = scene.inCircle(sent.id("aboutMemberId"));
        if (about == null || scene.isMe(about) || !writers.contains(about)) {
            throw ApiProblem.badRequest("invalid_about", "Choose one of the others to write about.");
        }
        if (scene.entries(PREDICTION).stream().anyMatch(p -> scene.isMe(p.authorId()) && about.equals(p.forId()))) {
            throw ApiProblem.conflict(
                    "written_already",
                    "You've already written one about " + scene.firstName(about) + ". One each is all there is.");
        }
        boolean seal = sent.flag("seal", true);
        return scene.add(
                EntryDraft.of(PREDICTION)
                        .by(scene.myId())
                        .forMember(about)
                        .doc(new Prediction(sent.need("text", 2000, "Write the prediction first.")))
                        .done(seal ? scene.now() : null, seal ? scene.myId() : null),
                clientId);
    }

    /** Only its writer changes a prediction, and only until it is sealed. */
    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        if (!entry.is(PREDICTION)) {
            throw Scene.entryGone();
        }
        switch (sight(scene, entry)) {
            case NOTHING -> throw Scene.entryGone();
            case ENVELOPE, OPEN -> throw sealed();
            case DRAFT -> {
                String text = sent.text("text", 2000, entry.as(Prediction.class).text());
                if (text == null) {
                    throw ApiProblem.badRequest("missing_text", "Write the prediction first.");
                }
                boolean seal = sent.flag("seal", false);
                scene.save(
                        entry,
                        EntryDraft.from(entry)
                                .doc(new Prediction(text))
                                .done(seal ? scene.now() : null, seal ? scene.myId() : null));
            }
        }
    }

    /** Its writer can take a prediction out, unread. Nobody else can. */
    @Override
    public void remove(Scene scene, EntryRow entry) {
        if (!entry.is(PREDICTION) || sight(scene, entry) == Sight.NOTHING) {
            throw Scene.entryGone();
        }
        if (!scene.isMe(entry.authorId())) {
            throw BoardRules.notYours();
        }
        scene.remove(entry.id());
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        switch (verb) {
            case "seal" -> {
                UUID one = sent.id("entryId");
                List<EntryRow> mine = scene.entries(PREDICTION).stream()
                        .filter(p -> scene.isMe(p.authorId()) && !p.done())
                        .filter(p -> one == null || one.equals(p.id()))
                        .toList();
                if (one != null && mine.isEmpty()) {
                    EntryRow asked = scene.need(one);
                    if (!asked.is(PREDICTION) || sight(scene, asked) == Sight.NOTHING) {
                        throw Scene.entryGone();
                    }
                    if (!scene.isMe(asked.authorId())) {
                        throw BoardRules.notYours();
                    }
                }
                mine.forEach(p -> scene.save(p, EntryDraft.from(p).done(scene.now(), scene.myId())));
            }
            case MARK -> {
                EntryRow prediction = scene.need(sent.id("predictionId"));
                if (!prediction.is(PREDICTION) || sight(scene, prediction) == Sight.NOTHING) {
                    throw Scene.entryGone();
                }
                if (sight(scene, prediction) != Sight.OPEN) {
                    throw sealed();
                }
                if (scene.myId() == null || scene.isMe(prediction.authorId())) {
                    throw ApiProblem.conflict(
                            "your_own", "It's your own prediction. The others say whether you were right.");
                }
                EntryRow mine = scene.under(prediction.id()).stream()
                        .filter(m -> m.is(MARK) && scene.isMe(m.authorId()))
                        .findFirst()
                        .orElse(null);
                Boolean right = sent.flag("right");
                if (right == null) {
                    if (mine != null) {
                        scene.remove(mine.id());
                    }
                } else if (mine != null) {
                    scene.save(mine, EntryDraft.from(mine).doc(new Mark(right)));
                } else {
                    scene.add(
                            EntryDraft.of(MARK)
                                    .under(prediction.id())
                                    .by(scene.myId())
                                    .doc(new Mark(right)),
                            Scene.derivedId(prediction.id(), "mark of " + scene.myId()));
                }
            }
            default -> throw BoardRules.unknownVerb();
        }
    }

    // ---------- what it brings to the rest ----------

    @Override
    public String glance(Scene scene) {
        PredictionsSettings settings = scene.settings(PredictionsSettings.class);
        long sealed = scene.entries(PREDICTION).stream().filter(EntryRow::done).count();
        return open(scene)
                ? "Opened " + Words.day(settings.opensOn()) + " · " + Words.count(sealed, "prediction")
                : sealed + " sealed · opens " + Words.day(settings.opensOn());
    }

    @Override
    public List<TodayItem> today(Scene scene) {
        if (!scene.today().equals(scene.settings(PredictionsSettings.class).opensOn())) {
            return List.of();
        }
        return List.of(new TodayItem(
                scene.boardId(),
                ThingKind.BOARD,
                scene.title(),
                "The predictions open today",
                null,
                null,
                1440,
                List.of()));
    }
}
