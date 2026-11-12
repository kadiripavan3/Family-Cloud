package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Mystery date, tried as the one who plans and the one who is taken. What it is, the plan, and the clues
 * whose moment hasn't come don't leave the API for anyone but the planner, by any route.
 */
class MysteryDateTest extends FunBoardTest {

    private static final String WHAT = "Sledging down Krvavec in the dark";
    private static final String LINE = "Marzipan tickets for two, booked";
    private static final String LATER = "Quince: be at the bus stop at seven";

    @Test
    void theOtherOneGetsATimeAHintAndTheCluesWhoseMomentHasCome() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        String board = board(nora, circle, "mystery_date", null, null);
        LocalDate day = TODAY.plusDays(3);
        Instant start = day.atTime(19, 0).toInstant(ZoneOffset.UTC);

        String date = add(
                nora,
                board,
                "date",
                "{\"day\":\"%s\",\"time\":\"20:00\",\"at\":\"%s\",\"hint\":\"Wear something warm.\",\"title\":\"%s\"}"
                        .formatted(day, start, WHAT));
        String line = add(
                nora,
                board,
                "line",
                "{\"dateId\":\"%s\",\"icon\":\"pin\",\"title\":\"%s\",\"cents\":4600,\"ready\":true}"
                        .formatted(date, LINE));
        String open =
                add(nora, board, "clue", "{\"dateId\":\"%s\",\"text\":\"Bring the thick gloves.\"}".formatted(date));
        String later = add(
                nora,
                board,
                "clue",
                "{\"dateId\":\"%s\",\"text\":\"%s\",\"opensAt\":\"%s\"}"
                        .formatted(date, LATER, start.minusSeconds(3600)));

        // The planner sees all of it.
        String hers = view(nora, board);
        assertThat(JsonPath.<Boolean>read(hers, "$.view.next.yours")).isTrue();
        assertThat(JsonPath.<String>read(hers, "$.view.next.title")).isEqualTo(WHAT);
        assertThat(JsonPath.<List<String>>read(hers, "$.view.next.plan[*].title"))
                .containsExactly(LINE);
        assertThat(JsonPath.<List<Integer>>read(hers, "$.view.next.plan[*].cents"))
                .containsExactly(4600);
        assertThat(JsonPath.<List<String>>read(hers, "$.view.next.clues[*].text"))
                .containsExactly("Bring the thick gloves.", LATER);
        assertThat(JsonPath.<List<Boolean>>read(hers, "$.view.next.clues[*].open"))
                .containsExactly(true, false);
        assertThat(glance(nora, board)).endsWith("your turn to plan");

        // The other one: the day, the time, the hint, who is planning, the clue that is open, and how many are
        // still to come. Not what it is, not the plan, not the clue whose moment hasn't come.
        String his = view(alex, board);
        assertThat(JsonPath.<Boolean>read(his, "$.view.next.yours")).isFalse();
        assertThat(JsonPath.<String>read(his, "$.view.next.day")).isEqualTo(day.toString());
        assertThat(JsonPath.<String>read(his, "$.view.next.time")).isEqualTo("20:00");
        assertThat(JsonPath.<String>read(his, "$.view.next.hint")).isEqualTo("Wear something warm.");
        assertThat(JsonPath.<String>read(his, "$.view.next.planner.name")).isEqualTo("Nora");
        assertThat(JsonPath.<Object>read(his, "$.view.next.title")).isNull();
        assertThat(JsonPath.<List<Object>>read(his, "$.view.next.plan")).isEmpty();
        assertThat(JsonPath.<List<String>>read(his, "$.view.next.clues[*].text"))
                .containsExactly("Bring the thick gloves.");
        assertThat(JsonPath.<Integer>read(his, "$.view.next.cluesToCome")).isEqualTo(1);
        assertThat(his).doesNotContain(line).doesNotContain(later);
        for (String secret : List.of(WHAT, LINE, LATER)) {
            assertSecret(alex, nora, circle, board, secret);
        }
        assertThat(glance(alex, board)).endsWith("Nora is planning");
        // What he is allowed to know, he can find.
        assertThat(fetch("/v1/circles/" + circle + "/search?q=something warm", alex))
                .contains(board);
        assertThat(fetch("/v1/circles/" + circle + "/search?q=thick gloves", alex))
                .contains(board);

        // By their ids: what he may not read isn't there; what he may read isn't his to change.
        change(alex, line, "{\"title\":\"Peek\"}", 404);
        send(HttpMethod.DELETE, "/v1/board-entries/" + line, alex, null, 404);
        change(alex, later, "{\"text\":\"Peek\"}", 404);
        send(HttpMethod.DELETE, "/v1/board-entries/" + later, alex, null, 404);
        change(alex, open, "{\"text\":\"Bring nothing\"}", 403);
        change(alex, date, "{\"hint\":\"Wear nothing warm.\"}", 403);
        send(HttpMethod.DELETE, "/v1/board-entries/" + date, alex, null, 403);
        act(alex, board, "reveal", "{\"entryId\":\"%s\"}".formatted(date), 403);
        add(alex, board, "line", "{\"dateId\":\"%s\",\"title\":\"A detour\"}".formatted(date), 403);
        add(alex, board, "clue", "{\"dateId\":\"%s\",\"text\":\"A red herring\"}".formatted(date), 403);
        assertThat(add(alex, board, "date", "{\"day\":\"%s\"}".formatted(day.plusDays(7)), 409))
                .contains("There is a date being planned already");

        // Today: each has a card, in their own words.
        String herCard = today(nora, circle);
        assertThat(JsonPath.<String>read(herCard, "$.cards[0].title")).endsWith(" is yours to plan");
        assertThat(JsonPath.<String>read(herCard, "$.cards[0].line"))
                .isEqualTo("All Alex knows: “20:00, wear something warm”");
        assertThat(JsonPath.<String>read(herCard, "$.cards[0].look")).isEqualTo("mystery_date");
        String hisCard = today(alex, circle);
        assertThat(JsonPath.<String>read(hisCard, "$.cards[0].title")).endsWith(": a mystery date");
        assertThat(JsonPath.<String>read(hisCard, "$.cards[0].line"))
                .isEqualTo("Nora is planning. 20:00. Wear something warm.");

        // She changes the hint: the moment it starts stays where her phone put it.
        change(nora, date, "{\"hint\":\"Wear something very warm.\"}", 200);
        assertThat(JsonPath.<String>read(view(alex, board), "$.view.next.at")).isEqualTo(start.toString());

        // The later clue's moment comes, by the API's clock.
        moveMoment(later, "opens_at", Instant.now().minusSeconds(60));
        String withClue = view(alex, board);
        assertThat(JsonPath.<List<String>>read(withClue, "$.view.next.clues[*].text"))
                .containsExactly("Bring the thick gloves.", LATER);
        assertThat(JsonPath.<Integer>read(withClue, "$.view.next.cluesToCome")).isZero();
        assertThat(fetch("/v1/circles/" + circle + "/search?q=Quince", alex)).contains(board);
        change(alex, later, "{\"text\":\"Peek\"}", 403); // he may read it now, and still not change it
        assertSecret(alex, nora, circle, board, WHAT);
        assertSecret(alex, nora, circle, board, LINE);

        // They are there: she reveals it. Everything is his to see, and it joins the dates there have been.
        act(nora, board, "reveal", "{\"entryId\":\"%s\"}".formatted(date), 200);
        String after = view(alex, board);
        assertThat(JsonPath.<Object>read(after, "$.view.next")).isNull();
        assertThat(JsonPath.<String>read(after, "$.view.past[0].title")).isEqualTo(WHAT);
        assertThat(JsonPath.<String>read(after, "$.view.past[0].planner.name")).isEqualTo("Nora");
        assertThat(JsonPath.<String>read(after, "$.view.turn.name")).isEqualTo("Alex"); // his turn to plan the next
        assertThat(JsonPath.<Boolean>read(after, "$.view.yourTurn")).isTrue();
        assertThat(JsonPath.<Integer>read(after, "$.view.thisYear"))
                .isEqualTo(day.getYear() == TODAY.getYear() ? 1 : 0);
        assertThat(JsonPath.<List<String>>read(fetch("/v1/boards/" + board + "/entries", alex), "$.items[*].title"))
                .containsExactly(WHAT);
        assertThat(fetch("/v1/circles/" + circle + "/search?q=Sledging", alex)).contains(board);
        assertThat(glance(alex, board)).isEqualTo("1 date so far");
        assertThat(JsonPath.<List<Object>>read(today(alex, circle), "$.cards")).isEmpty();
    }

    @Test
    void aDateIsRevealedWhenItsMomentComesAndTheJarHelpsOnlyThePlanner() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        String board = board(nora, circle, "mystery_date", null, null);
        assertThat(JsonPath.<String>read(view(alex, board), "$.view.turn.name")).isEqualTo("Nora");

        // The jar is everyone's; what it gives the planner is the planner's alone.
        add(alex, board, "idea", "{\"text\":\"Karaoke, one song each\"}");
        String bowling = add(nora, board, "idea", "{\"text\":\"Bowling in rented shoes\"}");
        assertThat(act(nora, board, "shake", "{}", 409)).contains("Start the date first");
        String date = add(
                nora,
                board,
                "date",
                "{\"day\":\"%s\",\"time\":\"7:30\",\"title\":\"%s\"}".formatted(TODAY.plusDays(1), WHAT));
        String first = JsonPath.read(act(nora, board, "shake", "{}", 200), "$.view.next.suggestion");
        String second = JsonPath.read(act(nora, board, "shake", "{}", 200), "$.view.next.suggestion");
        assertThat(List.of(first, second))
                .containsExactlyInAnyOrder("Karaoke, one song each", "Bowling in rented shoes");
        String his = view(alex, board);
        assertThat(JsonPath.<Object>read(his, "$.view.next.suggestion")).isNull();
        assertThat(JsonPath.<Integer>read(his, "$.view.ideas")).isEqualTo(2);
        assertThat(act(alex, board, "shake", "{}", 409)).contains("Start the date first");
        // With no moment from the phone, the day and the time are read as UTC; a time is written as the clock says it.
        assertThat(JsonPath.<String>read(his, "$.view.next.time")).isEqualTo("07:30");
        assertThat(JsonPath.<String>read(his, "$.view.next.at"))
                .isEqualTo(TODAY.plusDays(1)
                        .atTime(7, 30)
                        .toInstant(ZoneOffset.UTC)
                        .toString());
        change(nora, date, "{\"time\":\"late\"}", 400);
        add(nora, board, "idea", "{}", 400);
        // An idea is taken out by whoever put it in.
        send(HttpMethod.DELETE, "/v1/board-entries/" + bowling, nora, null, 204);

        // The moment comes without anyone pressing anything: it is revealed.
        assertSecret(alex, nora, circle, board, WHAT);
        moveMoment(date, "opens_at", Instant.now().minusSeconds(60));
        String after = view(alex, board);
        assertThat(JsonPath.<Object>read(after, "$.view.next")).isNull();
        assertThat(JsonPath.<String>read(after, "$.view.past[0].title")).isEqualTo(WHAT);
        // Now it is his turn, and he can plan one. A day gone by can't be planned for.
        add(alex, board, "date", "{\"day\":\"%s\"}".formatted(TODAY.minusDays(1)), 400);
        add(alex, board, "date", "{\"day\":\"%s\",\"hint\":\"Bring an appetite.\"}".formatted(TODAY.plusDays(20)));
        String hers = view(nora, board);
        assertThat(JsonPath.<String>read(hers, "$.view.next.planner.name")).isEqualTo("Alex");
        assertThat(JsonPath.<Object>read(hers, "$.view.next.title")).isNull();
        assertThat(JsonPath.<String>read(hers, "$.view.turn.name")).isEqualTo("Nora");
        // More than two weeks off, it isn't on Today yet.
        assertThat(JsonPath.<List<Object>>read(today(nora, circle), "$.cards")).isEmpty();
    }
}
