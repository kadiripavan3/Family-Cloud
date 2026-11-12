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
import app.homeport.api.home.TodaySource.TodayCard;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.IntStream;
import org.springframework.stereotype.Component;

/**
 * The anniversary questions: the same few questions every year, each answered alone, opened side by side.
 *
 * <p><b>Years.</b> The board knows the day it all began. Year twelve is the twelfth anniversary of that day.
 * The first year of a board is the next anniversary after it was made. Years are written one at a time: the
 * year to write is the first one that hasn't opened.
 *
 * <p><b>Who sees what.</b> It is decided in {@link #opened} and {@link #reads}, and only there. A year opens
 * when both things are true: its day has come, and everyone taking part has answered every question of that
 * year. Until then a person reads only their own answers. Of the other person's they are told one thing:
 * whether they have finished. Not what, and not how many. So nobody can read the other's answers first and
 * then write their own: if one of the two is late, the year stays shut for both until they have written
 * theirs. Once a year has opened it stays open, and its answers can't be changed any more.
 *
 * <p>The day is the viewer's own day, but never more than a day from the API's (see {@code Today}): a phone
 * set to next July opens nothing.
 */
@Component
class Anniversary implements BoardRules {

    static final String QUESTION = "question";
    static final String ANSWER = "answer";
    private static final int MAX_QUESTIONS = 20;

    static final List<String> FIVE_QUESTIONS = List.of(
            "The best day of this year?",
            "What should we do more of?",
            "What did I not thank you for?",
            "What made us laugh the most?",
            "What are you looking forward to?");

    /** Words too ordinary to count as "you both said the same". */
    private static final Set<String> ORDINARY = Set.of(
            "that",
            "this",
            "with",
            "when",
            "what",
            "were",
            "have",
            "from",
            "your",
            "they",
            "them",
            "then",
            "than",
            "more",
            "most",
            "much",
            "some",
            "very",
            "just",
            "like",
            "into",
            "over",
            "also",
            "every",
            "year",
            "years",
            "time",
            "about",
            "would",
            "could",
            "should",
            "there",
            "their",
            "where",
            "which",
            "while",
            "being",
            "been",
            "always",
            "never",
            "really",
            "thing",
            "things",
            "because",
            "still",
            "even",
            "only",
            "both",
            "each",
            "other",
            "after",
            "before",
            "again",
            "obviously",
            "probably",
            "maybe",
            "definitely",
            "having",
            "going",
            "does",
            "doing",
            "will",
            "want",
            "know",
            "think");

    record AnniversarySettings(
            @Schema(description = "The day it all began: the anniversary is this day of every year")
            LocalDate since,

            @Schema(description = "The members who answer") List<UUID> people,

            @Schema(description = "The first year this board asks about")
            int firstYear) {
        AnniversarySettings {
            people = people == null ? List.of() : List.copyOf(people);
        }
    }

    /**
     * A question.
     *
     * @param fromYear the first year it is asked in
     * @param untilYear the last year it was asked in, once it was taken out
     */
    record Wording(String text, Integer fromYear, Integer untilYear) {
        boolean askedIn(int year) {
            return (fromYear == null || fromYear <= year) && (untilYear == null || year <= untilYear);
        }
    }

    /** An answer. The entry's {@code parent_id} is its question, {@code author_id} who answered, {@code amount} the year. */
    record Reply(String text) {}

    record AnniversaryResponse(
            LocalDate since,
            List<PersonBrief> people,

            @Schema(description = "True when the person looking is one of those who answer")
            boolean youAnswer,

            @Schema(description = "The years that have opened, newest first")
            List<Integer> years,

            @Schema(nullable = true, description = "The opened year that is shown: the newest, or the one asked for")
            AnniversaryYearResponse shown,

            @Schema(description = "The year that is being written")
            AnniversaryNextResponse next) {}

    record AnniversaryYearResponse(
            @Schema(description = "Which anniversary: 12 for year twelve")
            int year,

            LocalDate day,
            List<AnniversaryQuestionResponse> questions) {}

    record AnniversaryQuestionResponse(
            UUID id,
            String text,

            @Schema(description = "Everyone's answer, side by side, in the order of the people")
            List<AnniversaryAnswerResponse> answers,

            @Schema(nullable = true, description = "A word all the answers share: You both said Bled")
            String same) {}

    record AnniversaryAnswerResponse(
            @Schema(nullable = true) PersonBrief person, boolean yours, String text) {}

    record AnniversaryNextResponse(
            int year,

            @Schema(description = "The day it opens, when everyone has answered by then")
            LocalDate opensOn,

            @Schema(description = "Days until that day; 0 from the day on")
            long daysToGo,

            @Schema(description = "True from that day on: it now opens as soon as everyone has answered")
            boolean dayHasCome,

            @Schema(description = "The questions of this year, each with this person's own answer so far")
            List<AnniversaryMineResponse> yours,

            @Schema(description = "How many of them this person has answered")
            int answered,

            @Schema(description = "True when this person has answered them all: theirs are sealed")
            boolean youAreDone,

            @Schema(description = "The others who answer, and whether each has finished. Never what they wrote.")
            List<AnniversaryOtherResponse> others) {}

    record AnniversaryMineResponse(
            UUID questionId,
            String question,

            @Schema(nullable = true, description = "The entry of this person's answer, to change it")
            UUID answerId,

            @Schema(nullable = true) String answer) {}

    record AnniversaryOtherResponse(
            PersonBrief person,

            @Schema(description = "True when they have answered every question: theirs are sealed")
            boolean done) {}

    @Override
    public Template template() {
        return Template.ANNIVERSARY;
    }

    @Override
    public Class<?> settingsType() {
        return AnniversarySettings.class;
    }

    @Override
    public Class<?> viewType() {
        return AnniversaryResponse.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: since (the day it all began; needed to start), people (member ids; left out: everyone in"
                        + " the circle)",
                "entry question: text. It is asked from the year that is being written.",
                "entry answer: questionId, text. It is this person's answer for the year that is being written;"
                        + " sending another for the same question replaces it. Everyone who answers may, also with a"
                        + " board they may only look at.",
                "show: a year that has opened, as its number (12). Left out: the newest.");
    }

    @Override
    public boolean viewersMayWrite(String kind) {
        return kind.equals(ANSWER);
    }

    // ---------- the rule ----------

    /** A word of four letters or more that every answer has, as the first answer writes it. Null when there is none. */
    static String same(List<String> answers) {
        if (answers.size() < 2 || answers.stream().anyMatch(Objects::isNull)) {
            return null;
        }
        List<Set<String>> others = answers.stream()
                .skip(1)
                .map(answer -> Set.copyOf(Arrays.asList(words(answer.toLowerCase(Locale.ROOT)))))
                .toList();
        for (String word : words(answers.get(0))) {
            String plain = word.toLowerCase(Locale.ROOT);
            if (plain.length() >= 4
                    && !ORDINARY.contains(plain)
                    && others.stream().allMatch(other -> other.contains(plain))) {
                return word;
            }
        }
        return null;
    }

    private static String[] words(String text) {
        return text.replace("’", "'").replaceAll("'s\\b", "").split("[^\\p{L}\\p{N}]+");
    }

    private static LocalDate dayOf(AnniversarySettings settings, int year) {
        return settings.since().plusYears(year);
    }

    private static List<EntryRow> questions(Scene scene, int year) {
        return scene.entries(QUESTION).stream()
                .filter(question -> question.as(Wording.class).askedIn(year))
                .toList();
    }

    private static List<EntryRow> answers(Scene scene, int year, UUID person) {
        return scene.entries(ANSWER).stream()
                .filter(answer -> answer.amountOr(-1) == year && person.equals(answer.authorId()))
                .toList();
    }

    /** True when this person has answered every question of a year. */
    private static boolean done(Scene scene, int year, UUID person) {
        Set<UUID> answered = Set.copyOf(
                answers(scene, year, person).stream().map(EntryRow::parentId).toList());
        return questions(scene, year).stream().allMatch(question -> answered.contains(question.id()));
    }

    /** The people who answer and are still in the circle. */
    private static List<UUID> people(Scene scene, AnniversarySettings settings) {
        return settings.people().stream()
                .filter(id -> scene.person(id) != null && !scene.person(id).left())
                .toList();
    }

    // ---------- who sees what ----------

    /** The one place that decides whether a year is open: its day has come, and everyone has answered all of it. */
    private static boolean opened(Scene scene, AnniversarySettings settings, int year) {
        return !scene.today().isBefore(dayOf(settings, year))
                && people(scene, settings).stream().allMatch(person -> done(scene, year, person));
    }

    /** The year that is being written: the first one that hasn't opened. Every year before it has. */
    private static int writing(Scene scene, AnniversarySettings settings) {
        int year = settings.firstYear();
        while (year < settings.firstYear() + 200 && opened(scene, settings, year)) {
            year++;
        }
        return year;
    }

    /** True when this person may read an answer: it is their own, or its year has opened. */
    private static boolean reads(Scene scene, AnniversarySettings settings, EntryRow answer) {
        return scene.isMe(answer.authorId()) || (answer.amount() != null && answer.amount() < writing(scene, settings));
    }

    // ---------- settings ----------

    @Override
    public Object settings(Scene scene, Fields sent) {
        AnniversarySettings now = scene.isNew() ? null : scene.settings(AnniversarySettings.class);
        LocalDate since = sent.day("since", now == null ? null : now.since());
        if (since == null || since.isAfter(scene.today())) {
            throw ApiProblem.badRequest("missing_since", "Choose the day it all began. It has to be today or earlier.");
        }
        boolean begun = !scene.isNew() && !scene.entries(ANSWER).isEmpty();
        List<UUID> people = sent.ids("people", 10);
        if (people == null) {
            people = now != null
                    ? now.people()
                    : scene.humans().stream().map(Person::id).toList();
        }
        for (UUID id : people) {
            scene.inCircle(id);
            if (scene.person(id).kind() == MemberKind.PET) {
                throw ApiProblem.badRequest("not_a_person", "The questions are for people.");
            }
        }
        if (people.isEmpty()) {
            throw ApiProblem.badRequest("nobody_chosen", "Choose who answers.");
        }
        if (begun && (!since.equals(now.since()) || !people.equals(now.people()))) {
            throw ApiProblem.conflict(
                    "has_answers", "There are answers in here already. The day and who answers stay as they are.");
        }
        // The first year asked about is the next anniversary: today's, when today is the day.
        int first = now != null && since.equals(now.since())
                ? now.firstYear()
                : (int) Math.max(
                        1, ChronoUnit.YEARS.between(since, scene.today().minusDays(1)) + 1);
        return new AnniversarySettings(since, people, first);
    }

    /** A new board starts with the five questions. */
    @Override
    public void started(Scene scene) {
        int first = scene.settings(AnniversarySettings.class).firstYear();
        int n = 0;
        for (String text : FIVE_QUESTIONS) {
            scene.add(
                    EntryDraft.of(QUESTION).by(scene.myId()).doc(new Wording(text, first, null)),
                    Scene.derivedId(scene.boardId(), "question " + n++));
        }
    }

    // ---------- what a person sees ----------

    @Override
    public Object view(Scene scene, String show) {
        AnniversarySettings settings = scene.settings(AnniversarySettings.class);
        int writing = writing(scene, settings);
        List<Integer> years = IntStream.range(settings.firstYear(), writing)
                .boxed()
                .sorted((a, b) -> b - a)
                .toList();
        Integer shown = years.isEmpty() ? null : years.get(0);
        if (show != null) {
            try {
                shown = Integer.valueOf(show.trim());
            } catch (NumberFormatException notAYear) {
                shown = null;
            }
            if (shown == null || !years.contains(shown)) {
                throw ApiProblem.badRequest("invalid_show", "Choose a year that has opened.");
            }
        }
        List<UUID> people = people(scene, settings);
        return new AnniversaryResponse(
                settings.since(),
                people.stream().map(scene::brief).toList(),
                people.contains(scene.myId()),
                years,
                shown == null ? null : year(scene, settings, people, shown),
                next(scene, settings, people, writing));
    }

    /** A year that has opened, for everyone to read: the caller asked {@link #opened} first. */
    private static AnniversaryYearResponse year(
            Scene scene, AnniversarySettings settings, List<UUID> people, int year) {
        return new AnniversaryYearResponse(
                year,
                dayOf(settings, year),
                questions(scene, year).stream()
                        .map(question -> {
                            List<AnniversaryAnswerResponse> answers = people.stream()
                                    .flatMap(person -> answers(scene, year, person).stream()
                                            .filter(answer -> question.id().equals(answer.parentId()))
                                            .limit(1))
                                    .map(answer -> new AnniversaryAnswerResponse(
                                            scene.brief(answer.authorId()),
                                            scene.isMe(answer.authorId()),
                                            answer.as(Reply.class).text()))
                                    .toList();
                            return new AnniversaryQuestionResponse(
                                    question.id(),
                                    question.as(Wording.class).text(),
                                    answers,
                                    same(answers.stream()
                                            .map(AnniversaryAnswerResponse::text)
                                            .toList()));
                        })
                        .toList());
    }

    private static AnniversaryNextResponse next(
            Scene scene, AnniversarySettings settings, List<UUID> people, int year) {
        LocalDate day = dayOf(settings, year);
        boolean answers = scene.me() != null && people.contains(scene.myId());
        List<EntryRow> mine = answers ? answers(scene, year, scene.myId()) : List.of();
        List<AnniversaryMineResponse> yours = !answers
                ? List.of()
                : questions(scene, year).stream()
                        .map(question -> {
                            EntryRow answer = mine.stream()
                                    .filter(row -> question.id().equals(row.parentId()))
                                    .findFirst()
                                    .orElse(null);
                            return new AnniversaryMineResponse(
                                    question.id(),
                                    question.as(Wording.class).text(),
                                    answer == null ? null : answer.id(),
                                    answer == null
                                            ? null
                                            : answer.as(Reply.class).text());
                        })
                        .toList();
        return new AnniversaryNextResponse(
                year,
                day,
                Math.max(0, ChronoUnit.DAYS.between(scene.today(), day)),
                !scene.today().isBefore(day),
                yours,
                (int) yours.stream().filter(one -> one.answer() != null).count(),
                answers && done(scene, year, scene.myId()),
                people.stream()
                        .filter(person -> !scene.isMe(person))
                        .map(person -> new AnniversaryOtherResponse(scene.brief(person), done(scene, year, person)))
                        .toList());
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        if (entry.is(QUESTION)) {
            return entry.as(Wording.class).text();
        }
        return entry.is(ANSWER) && reads(scene, scene.settings(AnniversarySettings.class), entry)
                ? entry.as(Reply.class).text()
                : null;
    }

    // ---------- changing it ----------

    private static ApiProblem opened() {
        return ApiProblem.conflict("opened", "That year has been opened. Its answers stay as they are.");
    }

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        AnniversarySettings settings = scene.settings(AnniversarySettings.class);
        int year = writing(scene, settings);
        switch (kind) {
            case QUESTION -> {
                scene.requireEdit();
                if (questions(scene, year).size() >= MAX_QUESTIONS) {
                    throw ApiProblem.conflict("too_many", "Twenty questions is as many as a year can hold.");
                }
                return scene.add(
                        EntryDraft.of(QUESTION)
                                .by(scene.myId())
                                .doc(new Wording(sent.need("text", 300, "Write the question first."), year, null)),
                        clientId);
            }
            case ANSWER -> {
                if (scene.me() == null || !people(scene, settings).contains(scene.myId())) {
                    throw new ApiProblem(
                            org.springframework.http.HttpStatus.FORBIDDEN,
                            "not_yours_to_answer",
                            "These questions are for "
                                    + Phrases.list(people(scene, settings).stream()
                                            .map(scene::firstName)
                                            .toList()) + ".");
                }
                EntryRow question = scene.need(sent.id("questionId"));
                if (!question.is(QUESTION) || !question.as(Wording.class).askedIn(year)) {
                    throw Scene.entryGone();
                }
                Reply reply = new Reply(sent.need("text", 2000, "Write your answer first."));
                EntryRow mine = answers(scene, year, scene.myId()).stream()
                        .filter(answer -> question.id().equals(answer.parentId()))
                        .findFirst()
                        .orElse(null);
                if (mine != null) {
                    scene.save(
                            mine,
                            EntryDraft.from(mine)
                                    .done(scene.now(), scene.myId())
                                    .doc(reply));
                    return mine.id();
                }
                return scene.add(
                        EntryDraft.of(ANSWER)
                                .under(question.id())
                                .by(scene.myId())
                                .amount((long) year)
                                .done(scene.now(), scene.myId())
                                .doc(reply),
                        Scene.derivedId(question.id(), "answer " + year + " " + scene.myId()));
            }
            default -> throw BoardRules.unknownKind();
        }
    }

    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        AnniversarySettings settings = scene.settings(AnniversarySettings.class);
        if (entry.is(QUESTION)) {
            scene.requireEdit();
            Wording now = entry.as(Wording.class);
            scene.save(
                    entry,
                    EntryDraft.from(entry)
                            .doc(new Wording(
                                    sent.need("text", 300, "Write the question first."),
                                    now.fromYear(),
                                    now.untilYear())));
            return;
        }
        if (!scene.isMe(entry.authorId())) {
            throw Scene.entryGone(); // someone else's answer isn't there to be changed
        }
        if (entry.amountOr(0) < writing(scene, settings)) {
            throw opened();
        }
        scene.save(
                entry,
                EntryDraft.from(entry)
                        .done(scene.now(), scene.myId())
                        .doc(new Reply(sent.need("text", 2000, "Write your answer first."))));
    }

    /**
     * An answer is taken back by its writer until its year opens. A question is taken out from the year that is
     * being written on; the years it was asked in keep it, with their answers.
     */
    @Override
    public void remove(Scene scene, EntryRow entry) {
        AnniversarySettings settings = scene.settings(AnniversarySettings.class);
        int year = writing(scene, settings);
        if (entry.is(ANSWER)) {
            if (!scene.isMe(entry.authorId())) {
                throw Scene.entryGone();
            }
            if (entry.amountOr(0) < year) {
                throw opened();
            }
            scene.remove(entry.id());
            return;
        }
        scene.requireEdit();
        Wording now = entry.as(Wording.class);
        boolean askedBefore = now.fromYear() != null && now.fromYear() < year;
        // What was written for it this year goes with it.
        scene.under(entry.id()).stream()
                .filter(answer -> answer.amountOr(0) >= year)
                .forEach(answer -> scene.remove(answer.id()));
        if (askedBefore) {
            scene.save(entry, EntryDraft.from(entry).doc(new Wording(now.text(), now.fromYear(), year - 1)));
        } else {
            scene.remove(entry.id());
        }
    }

    // ---------- what it brings to the rest ----------

    @Override
    public String glance(Scene scene) {
        AnniversarySettings settings = scene.settings(AnniversarySettings.class);
        int year = writing(scene, settings);
        LocalDate day = dayOf(settings, year);
        return "Year " + Phrases.inWords(year)
                + (scene.today().isBefore(day) ? " opens " + Words.day(day) : " opens when everyone has answered");
    }

    /** In the two weeks before the day, and from the day on while someone still has to answer. */
    @Override
    public List<TodayCard> cards(Scene scene) {
        AnniversarySettings settings = scene.settings(AnniversarySettings.class);
        List<UUID> people = people(scene, settings);
        if (scene.me() == null || !people.contains(scene.myId())) {
            return List.of();
        }
        int year = writing(scene, settings);
        LocalDate day = dayOf(settings, year);
        long toGo = ChronoUnit.DAYS.between(scene.today(), day);
        if (toGo > 14) {
            return List.of();
        }
        boolean mineDone = done(scene, year, scene.myId());
        String line = toGo > 0
                ? "Year " + Phrases.inWords(year) + " opens on " + Words.shortDay(day) + ". "
                        + (mineDone ? "Yours are sealed." : "Yours aren't written yet.")
                : mineDone
                        ? "Yours are sealed. It opens when everyone has answered."
                        : "The day has come. It opens when you have answered.";
        return List.of(Phrases.card(scene, scene.title(), line, null, null, mineDone ? null : "Write mine", 15));
    }
}
