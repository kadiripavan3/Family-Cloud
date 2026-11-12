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
import app.homeport.api.home.TodaySource.TodayItem;
import app.homeport.api.media.MediaKind;
import app.homeport.api.thing.ThingKind;
import app.homeport.api.thing.ThingService.PersonBrief;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.time.Period;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The birthday interview: the same questions on every birthday, and the answers side by side over the years.
 *
 * <p>An answer belongs to a question and to an age: "What do you want to be?" at 7, at 8, at 9. There is one
 * answer per question per age; answering again changes it. Ages are worked out from the birthday on the
 * person's page. In the thirty days before a birthday an answer counts for the age about to be reached, so
 * the interview can be done a little early.
 *
 * <p>A new interview starts with ten questions. They can be reworded, removed and added to.
 *
 * <p>Nothing here is secret: everyone who sees the interview sees all of it.
 */
@Component
class BirthdayInterview implements BoardRules {

    static final String QUESTION = "question";
    static final String ANSWER = "answer";

    static final List<String> TEN_QUESTIONS = List.of(
            "What do you want to be?",
            "What's the best food in the world?",
            "What do grown-ups say too much?",
            "Who is your best friend, and why?",
            "What are you really good at?",
            "What makes you laugh the most?",
            "What is the best thing about being you?",
            "Where would you go if you could go anywhere?",
            "What would you change if you were in charge at home?",
            "What do you want to remember about this year?");

    record BirthdayInterviewSettings(
            @Schema(description = "The member who is interviewed")
            UUID forMemberId) {}

    record Wording(String text) {}

    record BirthdayInterviewView(
            @Schema(nullable = true) PersonBrief person,
            @Schema(nullable = true) LocalDate birthday,

            @Schema(description = "The ages there are answers for, youngest first")
            List<Integer> ages,

            @Schema(nullable = true, description = "The next birthday. Null when no birthday is known.")
            BirthdayInterviewNext next,

            List<BirthdayInterviewQuestion> questions) {}

    record BirthdayInterviewNext(
            @Schema(description = "The age they turn") int age,
            LocalDate on,
            long inDays,

            @Schema(description = "Mia's 10th is in 23 days")
            String line) {}

    record BirthdayInterviewQuestion(
            UUID id,
            String text,

            @Schema(description = "One answer per age, youngest first")
            List<BirthdayInterviewAnswer> answers) {}

    record BirthdayInterviewAnswer(
            UUID id,
            int age,
            String text,

            @Schema(nullable = true, description = "The answer in their own voice")
            BoardMedia voice,

            @Schema(description = "True for the latest round there is")
            boolean latest) {}

    @Override
    public Template template() {
        return Template.BIRTHDAY_INTERVIEW;
    }

    @Override
    public Class<?> settingsType() {
        return BirthdayInterviewSettings.class;
    }

    @Override
    public Class<?> viewType() {
        return BirthdayInterviewView.class;
    }

    @Override
    public List<String> guide() {
        return List.of(
                "settings: forMemberId (who is interviewed; their page has to have a birthday)",
                "entry question: text",
                "entry answer: questionId, text, mediaId (an audio upload), age (left out: the age of this round)");
    }

    // ---------- ages ----------

    /** How old someone born on a day is on another day, in whole years. */
    static int ageOn(LocalDate birthday, LocalDate day) {
        return Period.between(birthday, day).getYears();
    }

    /** The next time a birthday comes round, today counted. */
    static LocalDate nextBirthday(LocalDate birthday, LocalDate today) {
        LocalDate thisYear = birthday.withYear(today.getYear());
        return thisYear.isBefore(today) ? birthday.withYear(today.getYear() + 1) : thisYear;
    }

    /** The age an answer given today counts for: the age reached, or the one about to be, in the month before a birthday. */
    static int roundOn(LocalDate birthday, LocalDate today) {
        LocalDate next = nextBirthday(birthday, today);
        int turning = ageOn(birthday, next);
        return ChronoUnit.DAYS.between(today, next) <= 30 ? turning : turning - 1;
    }

    // ---------- settings ----------

    @Override
    public Object settings(Scene scene, Fields sent) {
        UUID now = scene.isNew()
                ? null
                : scene.settings(BirthdayInterviewSettings.class).forMemberId();
        UUID who = scene.inCircle(sent.id("forMemberId", now));
        if (who == null || scene.person(who).kind() == MemberKind.PET) {
            throw ApiProblem.badRequest("missing_person", "Choose whose interview this is.");
        }
        if (scene.person(who).birthday() == null) {
            throw ApiProblem.badRequest(
                    "missing_birthday",
                    "Add " + Words.of(scene.firstName(who)) + " birthday on their page first. The ages come from it.");
        }
        if (now != null && !now.equals(who) && !scene.entries(ANSWER).isEmpty()) {
            throw ApiProblem.conflict(
                    "has_answers", "There are answers in here already. Start another interview for someone else.");
        }
        return new BirthdayInterviewSettings(who);
    }

    @Override
    public void started(Scene scene) {
        int n = 0;
        for (String question : TEN_QUESTIONS) {
            scene.add(
                    EntryDraft.of(QUESTION).by(scene.myId()).doc(new Wording(question)),
                    Scene.derivedId(scene.boardId(), "question " + n++));
        }
    }

    // ---------- what a person sees ----------

    @Override
    public Object view(Scene scene, String show) {
        Person person =
                scene.person(scene.settings(BirthdayInterviewSettings.class).forMemberId());
        List<EntryRow> answers = scene.entries(ANSWER);
        List<Integer> ages = answers.stream()
                .map(a -> (int) a.amountOr(0))
                .distinct()
                .sorted()
                .toList();
        int latest = ages.isEmpty() ? -1 : ages.get(ages.size() - 1);
        BirthdayInterviewNext next = null;
        if (person != null && person.birthday() != null) {
            LocalDate on = nextBirthday(person.birthday(), scene.today());
            int age = ageOn(person.birthday(), on);
            long inDays = ChronoUnit.DAYS.between(scene.today(), on);
            next = new BirthdayInterviewNext(age, on, inDays, line(scene.firstName(person.id()), age, inDays));
        }
        return new BirthdayInterviewView(
                person == null ? null : scene.brief(person.id()),
                person == null ? null : person.birthday(),
                ages,
                next,
                scene.entries(QUESTION).stream()
                        .map(q -> new BirthdayInterviewQuestion(
                                q.id(),
                                q.as(Wording.class).text(),
                                answers.stream()
                                        .filter(a -> q.id().equals(a.parentId()))
                                        .sorted(Comparator.comparingLong(a -> a.amountOr(0)))
                                        .map(a -> new BirthdayInterviewAnswer(
                                                a.id(),
                                                (int) a.amountOr(0),
                                                a.as(Wording.class).text(),
                                                scene.media(a.mediaId()),
                                                a.amountOr(0) == latest))
                                        .toList()))
                        .toList());
    }

    static String line(String name, int age, long inDays) {
        String whose = Words.of(name) + " " + Words.ordinal(age);
        return inDays == 0
                ? whose + " birthday is today"
                : inDays == 1 ? whose + " is tomorrow" : whose + " is in " + inDays + " days";
    }

    @Override
    public String findable(Scene scene, EntryRow entry) {
        return entry.as(Wording.class).text();
    }

    // ---------- changing it ----------

    @Override
    public UUID add(Scene scene, String kind, Fields sent, UUID clientId) {
        switch (kind) {
            case QUESTION -> {
                if (scene.entries(QUESTION).size() >= 30) {
                    throw ApiProblem.conflict("too_many", "Thirty questions is as many as an interview holds.");
                }
                return scene.add(
                        EntryDraft.of(QUESTION)
                                .by(scene.myId())
                                .doc(new Wording(sent.need("text", 200, "Write the question."))),
                        clientId);
            }
            case ANSWER -> {
                EntryRow question = scene.need(sent.id("questionId"));
                if (!question.is(QUESTION)) {
                    throw Scene.entryGone();
                }
                Person person = scene.person(
                        scene.settings(BirthdayInterviewSettings.class).forMemberId());
                Long asked = sent.whole("age", 0, 130);
                if (asked == null && (person == null || person.birthday() == null)) {
                    throw ApiProblem.badRequest("missing_age", "Say how old they are for this answer.");
                }
                long age = asked != null ? asked : roundOn(person.birthday(), scene.today());
                UUID voice = scene.upload(sent.id("mediaId"), MediaKind.AUDIO);
                String text = sent.text("text", 2000);
                if (text == null && voice == null) {
                    throw ApiProblem.badRequest("missing_text", "Write the answer, or record it.");
                }
                // One answer per question per age: answering again changes the one that is there.
                EntryRow there = scene.entries(ANSWER).stream()
                        .filter(a -> question.id().equals(a.parentId()) && a.amountOr(-1) == age)
                        .findFirst()
                        .orElse(null);
                if (there != null) {
                    scene.save(
                            there,
                            EntryDraft.from(there)
                                    .doc(new Wording(
                                            text == null
                                                    ? there.as(Wording.class).text()
                                                    : text))
                                    .media(voice == null ? there.mediaId() : voice));
                    return there.id();
                }
                return scene.add(
                        EntryDraft.of(ANSWER)
                                .under(question.id())
                                .by(scene.myId())
                                .forMember(person == null ? null : person.id())
                                .amount(age)
                                .day(scene.today())
                                .media(voice)
                                .doc(new Wording(text == null ? "" : text)),
                        clientId);
            }
            default -> throw BoardRules.unknownKind();
        }
    }

    @Override
    public void change(Scene scene, EntryRow entry, Fields sent) {
        String text = sent.text(
                "text", entry.is(QUESTION) ? 200 : 2000, entry.as(Wording.class).text());
        EntryDraft draft = EntryDraft.from(entry);
        if (entry.is(ANSWER) && sent.has("mediaId")) {
            draft.media(scene.upload(sent.id("mediaId"), MediaKind.AUDIO));
        }
        if (text == null && entry.is(QUESTION)) {
            throw ApiProblem.badRequest("missing_text", "Write the question.");
        }
        scene.save(entry, draft.doc(new Wording(text == null ? "" : text)));
    }

    // ---------- what it brings to the rest ----------

    @Override
    public String glance(Scene scene) {
        Person person =
                scene.person(scene.settings(BirthdayInterviewSettings.class).forMemberId());
        if (person != null && person.birthday() != null) {
            LocalDate on = nextBirthday(person.birthday(), scene.today());
            long inDays = ChronoUnit.DAYS.between(scene.today(), on);
            if (inDays <= 60) {
                return line(scene.firstName(person.id()), ageOn(person.birthday(), on), inDays);
            }
        }
        long years = scene.entries(ANSWER).stream()
                .map(EntryRow::amount)
                .filter(Objects::nonNull)
                .distinct()
                .count();
        return Words.count(scene.entries(QUESTION).size(), "question") + " · "
                + (years == 0 ? "no answers yet" : Words.count(years, "year") + " of answers");
    }

    @Override
    public List<TodayItem> today(Scene scene) {
        Person person =
                scene.person(scene.settings(BirthdayInterviewSettings.class).forMemberId());
        if (person == null
                || person.birthday() == null
                || !nextBirthday(person.birthday(), scene.today()).equals(scene.today())) {
            return List.of();
        }
        return List.of(new TodayItem(
                scene.boardId(),
                ThingKind.BOARD,
                scene.title(),
                Words.count(scene.entries(QUESTION).size(), "question") + ", today",
                null,
                null,
                1440,
                scene.avatars(person.id())));
    }
}
