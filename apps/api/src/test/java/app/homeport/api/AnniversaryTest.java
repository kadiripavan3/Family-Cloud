package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * The anniversary questions, tried as both of the two. Nobody reads the other's answers until the day has
 * come and both have answered everything, by any route.
 */
class AnniversaryTest extends FunBoardTest {

    private static final String HERS = "Pineapple pancakes on the balcony in Bled";
    private static final String HIS = "Marzipan on the ferry. Bled, of course";

    private List<String> questions(String token, String board) throws Exception {
        return JsonPath.read(view(token, board), "$.view.next.yours[*].questionId");
    }

    private String answer(String token, String board, String question, String text) throws Exception {
        return add(token, board, "answer", "{\"questionId\":\"%s\",\"text\":\"%s\"}".formatted(question, text));
    }

    @Test
    void nobodyReadsTheOthersAnswersUntilTheDayHasComeAndBothHaveAnswered() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        // It began three years ago in ten days' time: year three opens in ten days.
        LocalDate since = TODAY.plusDays(10).minusYears(3);
        assertThat(newBoard(nora, circle, "anniversary", null, "{}", 400)).contains("Choose the day it all began");
        newBoard(nora, circle, "anniversary", null, "{\"since\":\"%s\"}".formatted(TODAY.plusDays(1)), 400);
        String board = board(nora, circle, "anniversary", null, "{\"since\":\"%s\"}".formatted(since));

        String start = view(nora, board);
        assertThat(JsonPath.<List<String>>read(start, "$.view.people[*].name")).containsExactly("Nora", "Alex");
        assertThat(JsonPath.<Integer>read(start, "$.view.next.year")).isEqualTo(3);
        assertThat(JsonPath.<String>read(start, "$.view.next.opensOn"))
                .isEqualTo(since.plusYears(3).toString());
        assertThat(JsonPath.<Boolean>read(start, "$.view.next.dayHasCome")).isFalse();
        assertThat(JsonPath.<List<String>>read(start, "$.view.next.yours[*].question"))
                .containsExactly(
                        "The best day of this year?",
                        "What should we do more of?",
                        "What did I not thank you for?",
                        "What made us laugh the most?",
                        "What are you looking forward to?");
        assertThat(JsonPath.<List<Object>>read(start, "$.view.years")).isEmpty();
        assertThat(JsonPath.<Object>read(start, "$.view.shown")).isNull();
        assertThat(glance(nora, board)).startsWith("Year three opens ");
        List<String> questions = questions(nora, board);

        // Nora answers all five. She reads her own; of hers Alex is told one thing: that she has finished.
        String first = answer(nora, board, questions.get(0), HERS);
        for (int q = 1; q < 5; q++) {
            answer(nora, board, questions.get(q), "Her answer " + q);
        }
        String hers = view(nora, board);
        assertThat(JsonPath.<String>read(hers, "$.view.next.yours[0].answer")).isEqualTo(HERS);
        assertThat(JsonPath.<Boolean>read(hers, "$.view.next.youAreDone")).isTrue();
        assertThat(JsonPath.<Integer>read(hers, "$.view.next.answered")).isEqualTo(5);
        assertThat(JsonPath.<List<Boolean>>read(hers, "$.view.next.others[*].done"))
                .containsExactly(false);
        assertSecret(alex, nora, circle, board, HERS);
        String his = view(alex, board);
        assertThat(JsonPath.<List<Object>>read(his, "$.view.next.yours[*].answer"))
                .containsOnly((Object) null);
        assertThat(JsonPath.<List<String>>read(his, "$.view.next.others[*].person.name"))
                .containsExactly("Nora");
        assertThat(JsonPath.<List<Boolean>>read(his, "$.view.next.others[*].done"))
                .containsExactly(true);
        change(alex, first, "{\"text\":\"Peek\"}", 404);
        send(HttpMethod.DELETE, "/v1/board-entries/" + first, alex, null, 404);
        // An answer sent again for the same question replaces it: there is one answer a question a person a year.
        answer(nora, board, questions.get(1), "Her answer 1, thought over");
        assertThat(JsonPath.<Integer>read(view(nora, board), "$.view.next.answered"))
                .isEqualTo(5);
        assertThat(JsonPath.<String>read(view(nora, board), "$.view.next.yours[1].answer"))
                .isEqualTo("Her answer 1, thought over");

        // Alex answers four of five: neither reads the other's. Then the fifth: both have finished, and still
        // neither does, because the day hasn't come. A phone set to next month changes nothing.
        answer(alex, board, questions.get(0), HIS);
        for (int q = 1; q < 4; q++) {
            answer(alex, board, questions.get(q), "His reply " + q);
        }
        assertSecret(nora, nora, circle, board, HIS);
        assertSecret(alex, nora, circle, board, HERS);
        answer(alex, board, questions.get(4), "His reply 4");
        assertThat(JsonPath.<List<Boolean>>read(view(nora, board), "$.view.next.others[*].done"))
                .containsExactly(true);
        assertSecret(nora, nora, circle, board, HIS);
        assertSecret(alex, nora, circle, board, HERS);
        // Once anyone has answered, the day it began and who answers stay as they are.
        send(
                HttpMethod.PATCH,
                "/v1/boards/" + board,
                alex,
                "{\"settings\":{\"since\":\"%s\"}}".formatted(TODAY.minusYears(3)),
                409);

        // The day comes. It opens for both, side by side, and it says what they both said.
        setSetting(board, "since", TODAY.minusYears(3).toString());
        for (String who : List.of(nora, alex)) {
            String open = view(who, board);
            assertThat(JsonPath.<List<Integer>>read(open, "$.view.years")).containsExactly(3);
            assertThat(JsonPath.<Integer>read(open, "$.view.shown.year")).isEqualTo(3);
            assertThat(JsonPath.<List<String>>read(open, "$.view.shown.questions[0].answers[*].text"))
                    .containsExactly(HERS, HIS);
            assertThat(JsonPath.<List<String>>read(open, "$.view.shown.questions[0].answers[*].person.name"))
                    .containsExactly("Nora", "Alex");
            assertThat(JsonPath.<String>read(open, "$.view.shown.questions[0].same"))
                    .isEqualTo("Bled");
            assertThat(JsonPath.<Object>read(open, "$.view.shown.questions[2].same"))
                    .isNull();
            assertThat(JsonPath.<Integer>read(open, "$.view.next.year")).isEqualTo(4);
            assertThat(JsonPath.<Integer>read(open, "$.view.next.answered")).isZero();
            assertThat(fetch("/v1/circles/" + circle + "/search?q=Marzipan", who))
                    .contains(board);
        }
        assertThat(JsonPath.<List<Boolean>>read(view(alex, board), "$.view.shown.questions[0].answers[*].yours"))
                .containsExactly(false, true);
        // What was opened stays as it is.
        assertThat(change(nora, first, "{\"text\":\"On second thoughts\"}", 409))
                .contains("That year has been opened");
        send(HttpMethod.DELETE, "/v1/board-entries/" + first, nora, null, 409);
        assertThat(JsonPath.<Integer>read(fetch("/v1/boards/" + board + "?show=3", alex), "$.view.shown.year"))
                .isEqualTo(3);
        send(HttpMethod.GET, "/v1/boards/" + board + "?show=4", alex, null, 400);
        send(HttpMethod.GET, "/v1/boards/" + board + "?show=soon", alex, null, 400);
    }

    @Test
    void whenOneOfThemIsLateTheYearStaysShutForBothUntilTheyHaveAnswered() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        // The second anniversary is today.
        String board = board(nora, circle, "anniversary", null, "{\"since\":\"%s\"}".formatted(TODAY.minusYears(2)));
        List<String> questions = questions(nora, board);
        assertThat(JsonPath.<Integer>read(view(nora, board), "$.view.next.year"))
                .isEqualTo(2);
        assertThat(JsonPath.<Boolean>read(view(nora, board), "$.view.next.dayHasCome"))
                .isTrue();
        for (int q = 0; q < 5; q++) {
            answer(nora, board, questions.get(q), q == 0 ? HERS : "Her answer " + q);
        }

        // The day has come and she has finished; he hasn't started. He can't read hers first.
        assertSecret(alex, nora, circle, board, HERS);
        assertThat(JsonPath.<Object>read(view(alex, board), "$.view.shown")).isNull();
        assertThat(glance(alex, board)).isEqualTo("Year two opens when everyone has answered");
        // Today reminds each of them of their own side of it.
        assertThat(JsonPath.<List<String>>read(today(alex, circle), "$.cards[*].line"))
                .containsExactly("The day has come. It opens when you have answered.");
        assertThat(JsonPath.<List<String>>read(today(alex, circle), "$.cards[*].action"))
                .containsExactly("Write mine");
        assertThat(JsonPath.<List<String>>read(today(nora, circle), "$.cards[*].line"))
                .containsExactly("Yours are sealed. It opens when everyone has answered.");
        assertThat(JsonPath.<List<String>>read(today(nora, circle), "$.cards[*].action"))
                .containsExactly((String) null);
        // She can still think again, while it is shut.
        String hers = JsonPath.read(view(nora, board), "$.view.next.yours[1].answerId");
        change(nora, hers, "{\"text\":\"Her answer 1, thought over\"}", 200);

        // He writes his: with his last answer it opens, for both.
        for (int q = 0; q < 4; q++) {
            answer(alex, board, questions.get(q), q == 0 ? HIS : "His reply " + q);
        }
        assertSecret(alex, nora, circle, board, HERS);
        assertSecret(nora, nora, circle, board, HIS);
        answer(alex, board, questions.get(4), "His reply 4");
        for (String who : List.of(nora, alex)) {
            String open = view(who, board);
            assertThat(JsonPath.<Integer>read(open, "$.view.shown.year")).isEqualTo(2);
            assertThat(JsonPath.<List<String>>read(open, "$.view.shown.questions[1].answers[*].text"))
                    .containsExactly("Her answer 1, thought over", "His reply 1");
            assertThat(JsonPath.<Integer>read(open, "$.view.next.year")).isEqualTo(3);
            assertThat(JsonPath.<List<Object>>read(today(who, circle), "$.cards"))
                    .isEmpty();
        }

        // A question added now is asked from year three on; one taken out stays in the years it was asked in.
        String sixth = add(nora, board, "question", "{\"text\":\"What surprised you?\"}");
        send(HttpMethod.DELETE, "/v1/board-entries/" + questions.get(0), alex, null, 204);
        String after = view(nora, board);
        assertThat(JsonPath.<Integer>read(after, "$.view.shown.questions.length()"))
                .isEqualTo(5);
        assertThat(JsonPath.<String>read(after, "$.view.shown.questions[0].text"))
                .isEqualTo("The best day of this year?");
        assertThat(JsonPath.<List<String>>read(after, "$.view.next.yours[*].questionId"))
                .hasSize(5)
                .contains(sixth)
                .doesNotContain(questions.get(0));
        // An answer is for a question of the year being written, by someone who answers.
        answer(nora, board, sixth, "The snow in April");
        add(nora, board, "answer", "{\"questionId\":\"%s\",\"text\":\"Too late\"}".formatted(questions.get(0)), 404);
        add(nora, board, "answer", "{\"questionId\":\"%s\"}".formatted(sixth), 400);
        // A question that was only ever asked in the year being written goes for good, with what was written for it.
        send(HttpMethod.DELETE, "/v1/board-entries/" + sixth, nora, null, 204);
        assertThat(JsonPath.<Integer>read(view(nora, board), "$.view.next.answered"))
                .isZero();
        assertThat(questions(nora, board)).hasSize(4);
    }

    @Test
    void someoneWhoDoesNotAnswerReadsWhatHasOpenedAndNothingElse() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "crew", "Lisbon crew");
        String alexId = join(nora, circle, alex);
        join(nora, circle, kai);
        String board = board(
                nora,
                circle,
                "anniversary",
                null,
                "{\"since\":\"%s\",\"people\":[\"%s\",\"%s\"]}"
                        .formatted(TODAY.minusYears(1), memberOf(nora, circle), alexId));
        List<String> questions = questions(nora, board);
        for (String question : questions) {
            answer(nora, board, question, HERS);
        }

        // Kai sees the board, isn't asked anything, and reads nothing while it is shut.
        String asKai = view(kai, board);
        assertThat(JsonPath.<Boolean>read(asKai, "$.view.youAnswer")).isFalse();
        assertThat(JsonPath.<List<Object>>read(asKai, "$.view.next.yours")).isEmpty();
        assertSecret(kai, nora, circle, board, HERS);
        assertThat(add(
                        kai,
                        board,
                        "answer",
                        "{\"questionId\":\"%s\",\"text\":\"Mine\"}".formatted(questions.get(0)),
                        403))
                .contains("These questions are for Nora and Alex");
        assertThat(JsonPath.<List<Object>>read(today(kai, circle), "$.cards")).isEmpty();

        for (String question : questions) {
            answer(alex, board, question, HIS);
        }
        assertThat(JsonPath.<List<String>>read(view(kai, board), "$.view.shown.questions[0].answers[*].text"))
                .containsExactly(HERS, HIS);
    }
}
