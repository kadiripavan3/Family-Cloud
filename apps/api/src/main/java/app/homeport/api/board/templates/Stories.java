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
import app.homeport.api.common.PublicUrls;
import app.homeport.api.home.TodaySource.FreshCard;
import app.homeport.api.home.TodaySource.TodayItem;
import app.homeport.api.media.MediaKind;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Grandma's stories: one question a week goes to someone outside the circle as a link. They open it, talk,
 * and the recording is kept with the question. No app and no account on their side (see {@link StoryPages}).
 *
 * <p><b>One a week.</b> The first question goes out the day it is asked. Every later one waits its turn: it
 * goes out a week after the one before it, and never before the next sending day (Sunday unless the family
 * chose another). "This week's question" is the newest one that has gone out. Anyone who may change the board
 * can send a waiting question early.
 *
 * <p><b>The link.</b> Each question has its own link, with an end nobody can guess. Whoever has it can answer
 * that one question, once, and learns nothing else about the circle. The link is shown to the people who may
 * change the board, who send it on themselves (the phone's share sheet): the API sends no messages to people
 * outside.
 *
 * <p><b>Typed out.</b> Turning the recording into text needs a speech service, and none is connected. Each
 * question has a transcript that stays empty until one is, or until someone in the family types it in.
 *
 * <p>Nothing here is secret within the circle: everyone who sees the board hears every story.
 */
@Component
class Stories implements BoardRules {

    static final String QUESTION = "question";
    static final String PHOTO = "photo";

    record StoriesSettings(
            @Schema(description = "Who tells the stories: Astrid Lind")
            String tellerName,

            @Schema(description = "The weekday a question goes out, in lower case: sunday")
            String sendsOn) {}

    /** @param pending the upload their page was given a place for, until it is said to be done */
    record Question(String text, String transcript, UUID pending) {}

    record StoriesView(
            String tellerName,

            @Schema(description = "Their initials, for the round picture: AL")
            String initials,

            String sendsOn,

            @Schema(description = "How many questions have been answered")
            int told,

            @Schema(nullable = true, description = "The newest question that has gone out")
            StoriesQuestion thisWeek,

            @Schema(
                    description =
                            "Answered before this week's, newest first. The first twenty; the rest a page at a time.")
            List<StoriesQuestion> toldBefore,

            @Schema(description = "Not sent yet, in the order they go out")
            List<StoriesQuestion> waiting,

            @Schema(description = "Sent earlier and never answered. Their links still work.")
            List<StoriesQuestion> unanswered) {}

    record StoriesQuestion(
            UUID id,
            String text,

            @Schema(nullable = true, description = "Whose question it is")
            PersonBrief askedBy,

            @Schema(description = "The day it goes out, or went out")
            LocalDate goesOut,

            @Schema(description = "True once it has gone out")
            boolean out,

            boolean answered,
            @Schema(nullable = true) Instant answeredAt,

            @Schema(nullable = true, description = "Their answer, in their voice")
            BoardMedia recording,

            @Schema(
                    description =
                            "The answer typed out. Empty until a speech service is connected or someone types it.")
            String transcript,

            @Schema(description = "Photos the family added to the story")
            List<BoardMedia> photos,

            @Schema(
                    nullable = true,
                    description =
                            "The link to send them, while it is unanswered. Only for people who may change the board.")
            String link) {}

    private final PublicUrls urls;

    Stories(PublicUrls urls) {
        this.urls = urls;
    }

    @Override
    public Template template() {
        return Template.STORIES;
    }

    @Override
    public Class<?> settingsType() {
        return StoriesSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return StoriesView.class;
    }

    @Override
    public Class<?> entryType() {
        return StoriesQuestion.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: tellerName (who tells the stories), sendsOn (a weekday in lower case; left out: sunday)",
                "entry question: text, askedByMemberId (left out: you). When changing: text, transcript",
                "entry photo: questionId, mediaId (a photo upload): a photo for a story",
                "verb send_now: entryId (a waiting question goes out today)",
                "entries list: kind question, filter told (only answered ones)");
    }

    @Override
    public Object settings(Scene scene, Fields sent) {
        StoriesSettings now =
                scene.isNew() ? new StoriesSettings(null, "sunday") : scene.settings(StoriesSettings.class);
        String teller = sent.text("tellerName", 50, now.tellerName());
        if (teller == null) {
            throw ApiProblem.badRequest("missing_teller", "Say whose stories these are.");
        }
        String sendsOn = sent.text("sendsOn", 9, now.sendsOn());
        weekday(sendsOn);
        return new StoriesSettings(teller, sendsOn.toLowerCase(Locale.ROOT));
    }

    private static DayOfWeek weekday(String word) {
        try {
            return DayOfWeek.valueOf(String.valueOf(word).toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException notADay) {
            throw ApiProblem.badRequest("invalid_weekday", "Choose a day of the week.");
        }
    }

    static String initials(String name) {
        StringBuilder letters = new StringBuilder();
        for (String part : name.trim().split("\\s+")) {
            if (!part.isEmpty() && letters.length() < 2) {
                letters.append(Character.toUpperCase(part.charAt(0)));
            }
        }
        return letters.toString();
    }

    // ---------- one a week ----------

    /**
     * The day a new question goes out: today when nothing was asked before; otherwise a week after the last
     * one, and not before the next sending day.
     */
    static LocalDate goesOut(LocalDate today, LocalDate lastOut, DayOfWeek sendsOn) {
        if (lastOut == null) {
            return today;
        }
        LocalDate nextSendingDay = today.with(TemporalAdjusters.nextOrSame(sendsOn));
        LocalDate aWeekOn = lastOut.plusDays(7);
        return aWeekOn.isAfter(nextSendingDay) ? aWeekOn : nextSendingDay;
    }

    private static List<EntryRow> questions(Scene scene) {
        return scene.entries(QUESTION).stream()
                .filter(q -> q.day() != null)
                .sorted(Comparator.comparing(EntryRow::day)
                        .thenComparingDouble(EntryRow::position)
                        .thenComparing(EntryRow::id))
                .toList();
    }

    // ---------- what a person sees ----------

    @Override
    public Object view(Scene scene, String show) {
        StoriesSettings settings = scene.settings(StoriesSettings.class);
        List<EntryRow> all = questions(scene);
        EntryRow thisWeek = all.stream()
                .filter(q -> !q.day().isAfter(scene.today()))
                .reduce((first, second) -> second)
                .orElse(null);
        return new StoriesView(
                settings.tellerName(),
                initials(settings.tellerName()),
                settings.sendsOn(),
                (int) all.stream().filter(EntryRow::done).count(),
                thisWeek == null ? null : question(scene, thisWeek),
                all.stream()
                        .filter(q -> q.done() && q != thisWeek)
                        .sorted(Comparator.comparing(EntryRow::doneAt).reversed())
                        .limit(20)
                        .map(q -> question(scene, q))
                        .toList(),
                all.stream()
                        .filter(q -> q.day().isAfter(scene.today()))
                        .map(q -> question(scene, q))
                        .toList(),
                all.stream()
                        .filter(q -> !q.done() && !q.day().isAfter(scene.today()) && q != thisWeek)
                        .map(q -> question(scene, q))
                        .toList());
    }

    @Override
    public Object entry(Scene scene, EntryRow entry) {
        return entry.is(QUESTION) && entry.day() != null ? question(scene, entry) : null;
    }

    private StoriesQuestion question(Scene scene, EntryRow row) {
        Question question = row.as(Question.class);
        return new StoriesQuestion(
                row.id(),
                question.text(),
                scene.brief(row.forId()),
                row.day(),
                !row.day().isAfter(scene.today()),
                row.done(),
                row.doneAt(),
                scene.media(row.mediaId()),
                question.transcript() == null ? "" : question.transcript(),
                scene.under(row.id()).stream()
                        .map(p -> scene.media(p.mediaId()))
                        .filter(Objects::nonNull)
                        .toList(),
                !row.done() && row.token() != null && scene.canEdit() ? urls.to("/s/" + row.token()) : null);
    }

    @Override
    public boolean passes(Scene scene, EntryRow entry, String filter) {
        return !filter.equals("told") || entry.done();
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        if (!entry.is(QUESTION)) {
            return null;
        }
        Question question = entry.as(Question.class);
        return question.text() + (question.transcript() == null ? "" : " · " + question.transcript());
    }

    // ---------- changing it ----------

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        switch (kind) {
            case QUESTION -> {
                StoriesSettings settings = scene.settings(StoriesSettings.class);
                List<EntryRow> all = questions(scene);
                LocalDate lastOut =
                        all.isEmpty() ? null : all.get(all.size() - 1).day();
                LocalDate day = goesOut(scene.today(), lastOut, weekday(settings.sendsOn()));
                return scene.add(
                        EntryDraft.of(QUESTION)
                                .by(scene.myId())
                                .forMember(scene.inCircle(sent.id("askedByMemberId", scene.myId())))
                                .day(day)
                                .position(day.toEpochDay())
                                .token(Scene.newToken())
                                .doc(new Question(sent.need("text", 300, "Write the question."), "", null)),
                        clientId);
            }
            case PHOTO -> {
                EntryRow question = scene.need(sent.id("questionId"));
                UUID photo = scene.upload(sent.id("mediaId"), MediaKind.PHOTO);
                if (!question.is(QUESTION) || photo == null) {
                    throw ApiProblem.badRequest("missing_file", "Add the photo first.");
                }
                return scene.add(
                        EntryDraft.of(PHOTO)
                                .under(question.id())
                                .by(scene.myId())
                                .media(photo),
                        clientId);
            }
            default -> throw BoardRules.unknownKind();
        }
    }

    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        if (!entry.is(QUESTION)) {
            throw BoardRules.unknownKind();
        }
        Question now = entry.as(Question.class);
        String text = sent.text("text", 300, now.text());
        if (text == null) {
            throw ApiProblem.badRequest("missing_text", "Write the question.");
        }
        if (entry.done() && !text.equals(now.text())) {
            throw ApiProblem.conflict("answered", "It has been answered. The question stays as it was asked.");
        }
        String transcript = sent.text("transcript", 20000, now.transcript());
        scene.save(
                entry,
                EntryDraft.from(entry).doc(new Question(text, transcript == null ? "" : transcript, now.pending())));
    }

    @Override
    public void act(Scene scene, String verb, Fields sent) {
        if (!verb.equals("send_now")) {
            throw BoardRules.unknownVerb();
        }
        EntryRow question = scene.need(sent.id("entryId"));
        if (question.is(QUESTION) && question.day() != null && question.day().isAfter(scene.today())) {
            scene.save(
                    question,
                    EntryDraft.from(question)
                            .day(scene.today())
                            .position(scene.today().toEpochDay() + 0.5));
        }
    }

    // ---------- what it brings to the rest ----------

    @Override
    public String glance(Scene scene) {
        long told = scene.entries(QUESTION).stream().filter(EntryRow::done).count();
        return (told == 0 ? "No stories yet" : told + " told") + " · one question a week";
    }

    /** On the day a question goes out: someone has to send the link. */
    @Override
    public List<TodayItem> today(Scene scene) {
        if (!scene.canEdit()) {
            return List.of();
        }
        String teller =
                scene.settings(StoriesSettings.class).tellerName().trim().split("\\s+")[0];
        return scene.entries(QUESTION).stream()
                .filter(q -> scene.today().equals(q.day()) && !q.done())
                .map(q -> new TodayItem(
                        scene.boardId(),
                        ThingKind.BOARD,
                        "This week's question for " + teller,
                        q.as(Question.class).text() + " · send the link",
                        null,
                        null,
                        1440,
                        scene.avatars(q.forId())))
                .toList();
    }

    @Override
    public List<FreshCard> fresh(Scene scene) {
        Instant since = scene.now().minus(Duration.ofDays(7));
        String teller =
                scene.settings(StoriesSettings.class).tellerName().trim().split("\\s+")[0];
        return scene.entries(QUESTION).stream()
                .filter(q -> q.done() && q.doneAt().isAfter(since))
                .map(q -> {
                    BoardMedia recording = scene.media(q.mediaId());
                    return new FreshCard(
                            scene.boardId(),
                            ThingKind.BOARD,
                            q.as(Question.class).text(),
                            teller + " answered, by talking",
                            null,
                            recording == null || recording.seconds() == null ? null : Words.clock(recording.seconds()));
                })
                .toList();
    }
}
