package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** Four keepsakes with nothing to hide: the birthday interview, things they said, same spot, the doorframe. */
class KeepsakesTest extends BoardTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);

    private String child(String token, String circle, String name, LocalDate birthday) throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/circles/" + circle + "/members",
                        token,
                        "{\"clientId\":\"%s\",\"name\":\"%s\",\"kind\":\"child\"%s}"
                                .formatted(id(), name, birthday == null ? "" : ",\"birthday\":\"" + birthday + "\""),
                        201),
                "$.id");
    }

    @Test
    void theBirthdayInterviewKeepsTheSameQuestionsAndLinesUpTheAnswersByAge() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        // Nine years old, with a birthday in 23 days.
        LocalDate born = TODAY.plusDays(23).minusYears(10);
        String mia = child(nora, circle, "Mia", born);
        String interview = board(nora, circle, "birthday_interview", null, "{\"forMemberId\":\"%s\"}".formatted(mia));

        String fresh = view(nora, interview);
        assertThat(JsonPath.<Integer>read(fresh, "$.view.questions.length()")).isEqualTo(10);
        assertThat(JsonPath.<String>read(fresh, "$.view.questions[0].text")).isEqualTo("What do you want to be?");
        assertThat(JsonPath.<String>read(fresh, "$.view.person.name")).isEqualTo("Mia");
        assertThat(JsonPath.<Integer>read(fresh, "$.view.next.age")).isEqualTo(10);
        assertThat(JsonPath.<Integer>read(fresh, "$.view.next.inDays")).isEqualTo(23);
        assertThat(JsonPath.<String>read(fresh, "$.view.next.line")).isEqualTo("Mia's 10th is in 23 days");
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + interview, nora), "$.glance"))
                .isEqualTo("Mia's 10th is in 23 days");
        String question = JsonPath.read(fresh, "$.view.questions[0].id");

        // Earlier years are filled in with their age; an answer with no age counts for the birthday that is near.
        add(nora, interview, "answer", "{\"questionId\":\"%s\",\"age\":7,\"text\":\"A vet\"}".formatted(question));
        add(
                nora,
                interview,
                "answer",
                "{\"questionId\":\"%s\",\"age\":9,\"text\":\"A marine biologist\"}".formatted(question));
        add(
                nora,
                interview,
                "answer",
                "{\"questionId\":\"%s\",\"age\":8,\"text\":\"A vet with a horse\",\"mediaId\":\"%s\"}"
                        .formatted(question, recording(nora, 7)));
        String ten =
                add(nora, interview, "answer", "{\"questionId\":\"%s\",\"text\":\"An astronaut\"}".formatted(question));
        String lined = view(nora, interview);
        assertThat(JsonPath.<List<Integer>>read(lined, "$.view.questions[0].answers[*].age"))
                .containsExactly(7, 8, 9, 10);
        assertThat(JsonPath.<List<String>>read(lined, "$.view.questions[0].answers[*].text"))
                .containsExactly("A vet", "A vet with a horse", "A marine biologist", "An astronaut");
        assertThat(JsonPath.<List<Boolean>>read(lined, "$.view.questions[0].answers[*].latest"))
                .containsExactly(false, false, false, true);
        assertThat(JsonPath.<Integer>read(lined, "$.view.questions[0].answers[1].voice.seconds"))
                .isEqualTo(7);
        assertThat(JsonPath.<List<Integer>>read(lined, "$.view.ages")).containsExactly(7, 8, 9, 10);

        // One answer per question per age: answering again changes it.
        String again = add(
                nora,
                interview,
                "answer",
                "{\"questionId\":\"%s\",\"age\":10,\"text\":\"An astronaut. With a horse.\"}".formatted(question));
        assertThat(again).isEqualTo(ten);
        assertThat(JsonPath.<List<String>>read(view(nora, interview), "$.view.questions[0].answers[*].text"))
                .hasSize(4)
                .contains("An astronaut. With a horse.");
        assertThat(fetch("/v1/circles/" + circle + "/search?q=astronaut", nora)).contains(interview);

        // Questions can be reworded and added; ages need a birthday.
        change(nora, question, "{\"text\":\"What will you be?\"}", 200);
        add(nora, interview, "question", "{\"text\":\"What is your favourite word?\"}");
        assertThat(JsonPath.<Integer>read(view(nora, interview), "$.view.questions.length()"))
                .isEqualTo(11);
        String leo = child(nora, circle, "Leo", null);
        assertThat(newBoard(nora, circle, "birthday_interview", null, "{\"forMemberId\":\"%s\"}".formatted(leo), 400))
                .contains("Add Leo's birthday on their page first");
    }

    @Test
    void thingsTheySaidWorksOutTheAgeAndIsReadAPageAtATime() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        String leo =
                child(nora, circle, "Leo", TODAY.minusYears(6).minusMonths(2).minusDays(3));
        String mia = child(nora, circle, "Mia", TODAY.minusYears(9));
        String said = board(nora, circle, "said", null, null);

        add(
                nora,
                said,
                "quote",
                "{\"text\":\"The moon is following our car.\",\"saidByMemberId\":\"%s\",\"day\":\"%s\"}"
                        .formatted(leo, TODAY.minusYears(1).minusMonths(5)));
        add(
                alex,
                said,
                "quote",
                "{\"text\":\"I'll be the boss.\",\"saidByMemberId\":\"%s\",\"day\":\"%s\"}"
                        .formatted(mia, TODAY.minusYears(2)));
        add(
                nora,
                said,
                "quote",
                "{\"text\":\"My eyes are just heavy.\",\"saidByMemberId\":\"%s\",\"mediaId\":\"%s\"}"
                        .formatted(leo, recording(nora, 6)));
        add(nora, said, "quote", "{\"text\":\"In my day we walked.\",\"saidByName\":\"Grandpa\"}");

        String board = view(alex, said);
        assertThat(JsonPath.<Integer>read(board, "$.view.total")).isEqualTo(4);
        assertThat(JsonPath.<Integer>read(board, "$.view.withVoice")).isEqualTo(1);
        assertThat(JsonPath.<List<String>>read(board, "$.view.people[*].person.name"))
                .containsExactly("Leo", "Mia");
        assertThat(JsonPath.<List<Integer>>read(board, "$.view.people[*].count"))
                .containsExactly(2, 1);
        // Newest first by the day it was said, with the age on that day.
        assertThat(JsonPath.<List<String>>read(board, "$.view.latest[*].age"))
                .containsExactly(null, "6 years and 2 months", "4 years and 9 months", "7 years");
        assertThat(JsonPath.<String>read(board, "$.view.latest[0].whoName")).isEqualTo("Grandpa");
        assertThat(JsonPath.<Integer>read(board, "$.view.latest[1].voice.seconds"))
                .isEqualTo(6);
        assertThat(JsonPath.<String>read(board, "$.view.latest[2].writtenBy.name"))
                .isEqualTo("Nora");
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + said, alex), "$.glance"))
                .isEqualTo("4 quotes · latest from Grandpa");

        // A page at a time, and the chips: one person, with a voice, words.
        String first = fetch("/v1/boards/" + said + "/entries?limit=3", alex);
        assertThat(JsonPath.<Integer>read(first, "$.items.length()")).isEqualTo(3);
        String rest = fetch(
                "/v1/boards/" + said + "/entries?limit=3&cursor=" + JsonPath.<String>read(first, "$.nextCursor"), alex);
        assertThat(JsonPath.<List<String>>read(rest, "$.items[*].text")).containsExactly("I'll be the boss.");
        assertThat(JsonPath.<Object>read(rest, "$.nextCursor")).isNull();
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/boards/" + said + "/entries?member=" + leo, alex), "$.items[*].text"))
                .containsExactly("My eyes are just heavy.", "The moon is following our car.");
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/boards/" + said + "/entries?filter=voice", alex), "$.items[*].text"))
                .containsExactly("My eyes are just heavy.");
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/boards/" + said + "/entries?q=MOON", alex), "$.items[*].text"))
                .containsExactly("The moon is following our car.");
        send(HttpMethod.GET, "/v1/boards/" + said + "/entries?cursor=nonsense", alex, null, 400);
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/search?q=boss", alex), "$.hits[*].snippet"))
                .containsExactly("I'll be the boss.");

        // Not said tomorrow, not by a stranger, and not nothing.
        add(nora, said, "quote", "{\"text\":\"Later\",\"day\":\"%s\"}".formatted(TODAY.plusDays(2)), 400);
        add(nora, said, "quote", "{\"text\":\"Who?\",\"saidByMemberId\":\"%s\"}".formatted(id()), 400);
        assertThat(add(nora, said, "quote", "{}", 400)).contains("Write what they said");
    }

    @Test
    void sameSpotKeepsOnePhotoAYearAndHandsBackLastYearsToLayOverTheCamera() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "solo", "Just me");
        String spot = board(nora, circle, "same_spot", null, "{\"around\":\"09-01\"}");
        int year = TODAY.getYear();
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + spot, nora), "$.glance"))
                .isEqualTo("No photo yet");

        add(nora, spot, "photo", "{\"mediaId\":\"%s\",\"year\":%d}".formatted(uploadPhoto(nora), year - 2));
        String last = add(
                nora,
                spot,
                "photo",
                "{\"mediaId\":\"%s\",\"year\":%d,\"note\":\"New bag\"}".formatted(uploadPhoto(nora), year - 1));
        String before = view(nora, spot);
        assertThat(JsonPath.<Integer>read(before, "$.view.thisYear")).isEqualTo(year);
        assertThat(JsonPath.<Boolean>read(before, "$.view.takenThisYear")).isFalse();
        assertThat(JsonPath.<String>read(before, "$.view.last.id")).isEqualTo(last);
        assertThat(JsonPath.<String>read(before, "$.view.last.photo.url")).contains("/media/photos/");
        assertThat(JsonPath.<List<Integer>>read(before, "$.view.years[*].year")).containsExactly(year - 2, year - 1);

        // This year's photo: taken, and last year's is still the one to line up with.
        add(nora, spot, "photo", "{\"mediaId\":\"%s\"}".formatted(uploadPhoto(nora)));
        String after = view(nora, spot);
        assertThat(JsonPath.<Boolean>read(after, "$.view.takenThisYear")).isTrue();
        assertThat(JsonPath.<String>read(after, "$.view.last.id")).isEqualTo(last);
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + spot, nora), "$.glance"))
                .isEqualTo("3 years · " + (year - 2) + " to " + year);

        // One a year; a retake replaces the picture and the old file goes.
        assertThat(add(nora, spot, "photo", "{\"mediaId\":\"%s\"}".formatted(uploadPhoto(nora)), 409))
                .contains("There is a photo for " + year + " already");
        int files = jdbc.sql("select count(*) from media").query(Integer.class).single();
        change(nora, last, "{\"mediaId\":\"%s\"}".formatted(uploadPhoto(nora)), 200);
        assertThat(jdbc.sql("select count(*) from media").query(Integer.class).single())
                .isEqualTo(files);
        add(nora, spot, "photo", "{\"year\":1999}", 400);
        add(nora, spot, "photo", "{\"mediaId\":\"%s\",\"year\":1999}".formatted(recording(nora, 3)), 400);
        send(HttpMethod.PATCH, "/v1/boards/" + spot, nora, "{\"settings\":{\"around\":\"13-45\"}}", 400);

        // A photo's record that goes by itself (its owner's account was deleted) leaves the entry without a picture.
        jdbc.sql("delete from media where id = (select media_id from board_entries where id = cast(:id as uuid))")
                .param("id", last)
                .update();
        assertThat(JsonPath.<List<Integer>>read(view(nora, spot), "$.view.years[*].year"))
                .containsExactly(year - 2, year);
    }

    @Test
    void theDoorframeSaysHowMuchEachChildGrewAndWhenOneWasAsTallAsTheOther() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        int year = TODAY.getYear();
        // Mia's last birthday was a month ago at the earliest, so there is a mark near it.
        LocalDate miaBorn = TODAY.minusDays(40).minusYears(9);
        String mia = child(nora, circle, "Mia", miaBorn);
        String leo = child(nora, circle, "Leo", null);
        String door = board(nora, circle, "doorframe", null, null);
        LocalDate birthday = TODAY.minusDays(40);

        add(
                nora,
                door,
                "mark",
                "{\"memberId\":\"%s\",\"heightMm\":1175,\"day\":\"%s\"}".formatted(mia, birthday.minusYears(3)));
        add(
                nora,
                door,
                "mark",
                "{\"memberId\":\"%s\",\"heightMm\":1215,\"day\":\"%s\"}".formatted(mia, birthday.minusYears(2)));
        add(
                nora,
                door,
                "mark",
                "{\"memberId\":\"%s\",\"heightMm\":1260,\"day\":\"%s\"}".formatted(mia, birthday.minusYears(1)));
        add(
                nora,
                door,
                "mark",
                "{\"memberId\":\"%s\",\"heightMm\":1320,\"day\":\"%s\"}".formatted(mia, birthday.plusDays(2)));
        String newest = add(nora, door, "mark", "{\"memberId\":\"%s\",\"heightMm\":1335}".formatted(mia));
        add(
                nora,
                door,
                "mark",
                "{\"memberId\":\"%s\",\"heightMm\":1120,\"day\":\"%s\"}".formatted(leo, TODAY.minusYears(1)));
        add(nora, door, "mark", "{\"memberId\":\"%s\",\"heightMm\":1190,\"note\":\"On tiptoe\"}".formatted(leo));
        add(nora, door, "landmark", "{\"text\":\"Tall enough for the big slide\",\"heightMm\":1150}");
        add(nora, door, "landmark", "{\"text\":\"Up to Grandma Astrid's shoulder\",\"heightMm\":1370}");

        String seen = view(nora, door);
        // The ruler: tallest first, each with how much was grown since that child's mark before.
        assertThat(JsonPath.<List<Integer>>read(seen, "$.view.marks[*].heightMm"))
                .containsExactly(1335, 1320, 1260, 1215, 1190, 1175, 1120);
        assertThat(JsonPath.<List<Integer>>read(seen, "$.view.marks[*].grewMm"))
                .containsExactly(15, 60, 45, 40, 70, null, null);
        assertThat(JsonPath.<List<String>>read(seen, "$.view.children[*].person.name"))
                .containsExactly("Mia", "Leo");
        // Mia: 1.5 cm since the mark by her birthday. Leo has no birthday on his page: this year's growth instead.
        assertThat(JsonPath.<Integer>read(seen, "$.view.children[0].sinceBirthdayMm"))
                .isEqualTo(15);
        assertThat(JsonPath.<Integer>read(seen, "$.view.children[0].sinceLastMm"))
                .isEqualTo(15);
        assertThat(JsonPath.<List<String>>read(seen, "$.view.children[0].lines"))
                .containsExactly("1.5 cm since the last birthday", "Tall enough for the big slide");
        assertThat(JsonPath.<Object>read(seen, "$.view.children[1].sinceBirthdayMm"))
                .isNull();
        assertThat(JsonPath.<Integer>read(seen, "$.view.children[1].thisYearMm"))
                .isEqualTo(70);
        assertThat(JsonPath.<String>read(seen, "$.view.children[1].lines[0]")).startsWith("7 cm this year");
        assertThat(JsonPath.<String>read(seen, "$.view.children[1].landmark"))
                .isEqualTo("Tall enough for the big slide");
        // Leo is 119 cm now; Mia was that between her first two marks.
        assertThat(JsonPath.<List<String>>read(seen, "$.view.comparisons")).hasSize(1);
        assertThat(JsonPath.<String>read(seen, "$.view.comparisons[0]"))
                .startsWith("Mia was Leo's height in the ")
                .containsPattern("(spring|summer|autumn|winter) of (" + (year - 3) + "|" + (year - 2) + ")\\.");
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + door, nora), "$.glance"))
                .isEqualTo("Mia 133.5 cm · Leo 119 cm");
        assertThat(fetch("/v1/circles/" + circle + "/search?q=tiptoe", nora)).contains(door);

        // A mark can be corrected; it is for a person of this circle, has a sensible height and no day after today.
        change(nora, newest, "{\"heightMm\":1380}", 200);
        assertThat(JsonPath.<String>read(view(nora, door), "$.view.children[0].landmark"))
                .isEqualTo("Up to Grandma Astrid's shoulder");
        add(nora, door, "mark", "{\"memberId\":\"%s\",\"heightMm\":20}".formatted(mia), 400);
        add(
                nora,
                door,
                "mark",
                "{\"memberId\":\"%s\",\"heightMm\":1200,\"day\":\"%s\"}".formatted(mia, TODAY.plusDays(3)),
                400);
        add(nora, door, "mark", "{\"memberId\":\"%s\",\"heightMm\":1200}".formatted(id()), 400);
        assertThat(add(nora, door, "mark", "{\"heightMm\":1200}", 400)).contains("Choose whose mark this is");
        add(
                nora,
                door,
                "mark",
                "{\"memberId\":\"%s\",\"heightMm\":300}".formatted(addMember(nora, circle, "Biscuit", "pet")),
                400);
    }
}
