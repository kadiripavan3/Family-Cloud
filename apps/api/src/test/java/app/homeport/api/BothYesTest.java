package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Both said yes, tried as both of the two. An answer is its owner's alone: the other one is shown what both
 * said yes to, and nothing else. A "no" is never shown, not as a word, not as a count, and not by making
 * anything the other one is sent look different from when there was no answer at all.
 */
class BothYesTest extends FunBoardTest {

    private void say(String token, String board, String idea, Boolean yes) throws Exception {
        act(token, board, "say", "{\"ideaId\":\"%s\",\"yes\":%s}".formatted(idea, yes), 200);
    }

    /** Everything one person is sent about the board, by every route, without the times things were changed at. */
    private String everything(String token, String circle, String board) throws Exception {
        StringBuilder all = new StringBuilder();
        for (String path : List.of(
                "/v1/boards/" + board,
                "/v1/boards/" + board + "/entries?limit=100",
                "/v1/boards/" + board + "/entries?kind=say",
                "/v1/circles/" + circle + "/boards",
                "/v1/circles/" + circle + "/today?day=" + TODAY,
                "/v1/circles/" + circle + "/search?q=Tacos",
                "/v1/things/" + board)) {
            all.append(fetch(path, token).replaceAll("\"updatedAt\":\"[^\"]*\"", ""))
                    .append('\n');
        }
        return all.toString();
    }

    @Test
    void aNoIsNeverShownToAnyoneButItsOwnerNotEvenAsACount() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        String board = board(nora, circle, "both_yes", null, null);
        LocalDate saturday = TODAY.with(TemporalAdjusters.nextOrSame(DayOfWeek.SATURDAY));
        String dinner = add(
                nora,
                board,
                "deck",
                "{\"name\":\"Dinner\",\"emoji\":\"🍽️\",\"day\":\"%s\",\"mediaId\":\"%s\"}"
                        .formatted(saturday, uploadPhoto(nora)));
        String thai =
                add(nora, board, "idea", "{\"deckId\":\"%s\",\"text\":\"Thai\",\"emoji\":\"🍜\"}".formatted(dinner));
        String tacos =
                add(alex, board, "idea", "{\"deckId\":\"%s\",\"text\":\"Tacos\",\"emoji\":\"🌮\"}".formatted(dinner));
        String pizza = add(nora, board, "idea", "{\"deckId\":\"%s\",\"text\":\"Pizza\"}".formatted(dinner));

        // Before anyone has answered: three ideas, the first one up, no matches.
        String untouched = everything(alex, circle, board);
        String fresh = view(alex, board);
        assertThat(JsonPath.<List<String>>read(fresh, "$.view.people[*].name")).containsExactly("Nora", "Alex");
        assertThat(JsonPath.<String>read(fresh, "$.view.deck.card.text")).isEqualTo("Thai");
        assertThat(JsonPath.<Integer>read(fresh, "$.view.deck.number")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(fresh, "$.view.deck.of")).isEqualTo(3);

        // Nora says no to Thai, in private. Nothing Alex is sent, by any route, is different from before.
        say(nora, board, thai, false);
        assertThat(everything(alex, circle, board)).isEqualTo(untouched);
        // And had she said yes instead, it would still be the same to him: he hasn't answered it.
        say(nora, board, thai, true);
        assertThat(everything(alex, circle, board)).isEqualTo(untouched);
        // She sees her own answer, and the next card.
        String hers = view(nora, board);
        assertThat(JsonPath.<Integer>read(hers, "$.view.decks[0].seen")).isEqualTo(1);
        assertThat(JsonPath.<String>read(hers, "$.view.deck.card.text")).isEqualTo("Tacos");
        assertThat(JsonPath.<Integer>read(hers, "$.view.deck.number")).isEqualTo(2);
        assertThat(JsonPath.<List<Boolean>>read(
                        fetch("/v1/boards/" + board + "/entries", nora), "$.items[?(@.text == 'Thai')].yours"))
                .containsExactly(true);

        // Alex says no to Tacos and hasn't finished. Nothing Nora is sent differs from when he hadn't answered it,
        // whatever she herself says to Tacos.
        say(nora, board, tacos, true);
        String beforeHisNo = everything(nora, circle, board);
        say(alex, board, tacos, false);
        assertThat(everything(nora, circle, board)).isEqualTo(beforeHisNo);
        say(alex, board, tacos, null); // he takes it back
        assertThat(everything(nora, circle, board)).isEqualTo(beforeHisNo);
        say(alex, board, tacos, false);

        // Alex says yes to Thai: they both did, and both are shown it.
        say(alex, board, thai, true);
        for (String who : List.of(nora, alex)) {
            String matched = view(who, board);
            assertThat(JsonPath.<List<String>>read(matched, "$.view.deck.matches[*].text"))
                    .containsExactly("Thai");
            assertThat(JsonPath.<Integer>read(matched, "$.view.decks[0].matches"))
                    .isEqualTo(1);
            assertThat(glance(who, board)).isEqualTo("1 match · 1 deck");
            String card = today(who, circle);
            assertThat(JsonPath.<String>read(card, "$.cards[0].figure")).isEqualTo("A match");
            assertThat(JsonPath.<String>read(card, "$.cards[0].line"))
                    .isEqualTo(saturday.equals(TODAY) ? "Thai, tonight" : "Thai, on Saturday");
            assertThat(JsonPath.<String>read(card, "$.cards[0].imageUrl")).contains("/media/photos");
        }
        // Nora's own yes to Tacos is hers; that it met a no is said nowhere. There is no entry for an answer,
        // and no number anywhere that counts his.
        String hersNow = everything(nora, circle, board);
        assertThat(JsonPath.<List<Boolean>>read(
                        fetch("/v1/boards/" + board + "/entries", nora), "$.items[?(@.text == 'Tacos')].match"))
                .containsExactly(false);
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/boards/" + board + "/entries?kind=say", nora), "$.items"))
                .isEmpty();
        assertThat(hersNow).doesNotContain("\"no\"").doesNotContain("nos\"").doesNotContain("\"said\"");
        assertThat(JsonPath.<Map<String, Object>>read(view(nora, board), "$.view.decks[0]")
                        .keySet())
                .containsExactlyInAnyOrder(
                        "id",
                        "name",
                        "label",
                        "emoji",
                        "locked",
                        "day",
                        "picture",
                        "ideas",
                        "seen",
                        "youFinished",
                        "finished",
                        "matches");
        assertThat(JsonPath.<List<Object>>read(view(nora, board), "$.view.decks[0].finished"))
                .isEmpty();

        // An answer can't be reached by its id, by its owner or by anyone.
        String hisNo = jdbc.sql("select id from board_entries where kind = 'say' and amount = 0")
                .query(java.util.UUID.class)
                .single()
                .toString();
        for (String who : List.of(nora, alex)) {
            change(who, hisNo, "{\"yes\":true}", 404);
            send(HttpMethod.DELETE, "/v1/board-entries/" + hisNo, who, null, 404);
        }

        // He finishes the deck. That he has is told, as the drawing has it; what he said is not.
        say(alex, board, pizza, true);
        String finished = view(nora, board);
        assertThat(JsonPath.<List<String>>read(finished, "$.view.decks[0].finished[*].name"))
                .containsExactly("Alex");
        assertThat(JsonPath.<Boolean>read(finished, "$.view.decks[0].youFinished"))
                .isFalse();
        assertThat(JsonPath.<Integer>read(view(alex, board), "$.view.decks[0].seen"))
                .isEqualTo(3);
        assertThat(JsonPath.<Object>read(view(alex, board), "$.view.deck.card")).isNull();
        // She says no to Pizza: his yes there stays his.
        say(nora, board, pizza, false);
        assertThat(JsonPath.<List<Boolean>>read(
                        fetch("/v1/boards/" + board + "/entries", alex), "$.items[?(@.text == 'Pizza')].match"))
                .containsExactly(false);
        assertThat(JsonPath.<List<String>>read(view(alex, board), "$.view.deck.matches[*].text"))
                .containsExactly("Thai");
        // A guest gets the name of the board.
        assertThat(guestPage(nora, circle, board)).doesNotContain("Thai").doesNotContain("Tacos");
    }

    @Test
    void decksAreAnsweredOneIdeaAtATimeAndARewordedIdeaIsAskedAgain() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "crew", "Lisbon crew");
        String alexId = join(nora, circle, alex);
        join(nora, circle, kai);
        String board = board(
                nora,
                circle,
                "both_yes",
                null,
                "{\"people\":[\"%s\",\"%s\"]}".formatted(memberOf(nora, circle), alexId));
        String film = add(nora, board, "deck", "{\"name\":\"Friday's film\",\"label\":\"Film\"}");
        String names = add(nora, board, "deck", "{\"name\":\"Names\",\"locked\":true}");
        String heist = add(nora, board, "idea", "{\"deckId\":\"%s\",\"text\":\"A heist\"}".formatted(film));
        add(nora, board, "idea", "{\"deckId\":\"%s\",\"text\":\"Ada\"}".formatted(names));

        String seen = view(nora, board);
        assertThat(JsonPath.<List<String>>read(seen, "$.view.decks[*].label")).containsExactly("Film", "Names");
        assertThat(JsonPath.<List<Boolean>>read(seen, "$.view.decks[*].locked")).containsExactly(false, true);
        assertThat(JsonPath.<String>read(seen, "$.view.deck.id")).isEqualTo(film);
        // A deck is opened by its id; one that isn't there isn't opened.
        assertThat(JsonPath.<String>read(
                        fetch("/v1/boards/" + board + "?show=" + names, nora), "$.view.deck.card.text"))
                .isEqualTo("Ada");
        send(HttpMethod.GET, "/v1/boards/" + board + "?show=" + id(), nora, null, 400);

        // Both say yes: a match made today, in a deck with no day, is on today's card with the deck's name.
        say(nora, board, heist, true);
        say(alex, board, heist, true);
        assertThat(JsonPath.<String>read(today(alex, circle), "$.cards[0].line"))
                .isEqualTo("A heist · Friday's film");
        // With the first deck finished, the next one with something left opens by itself.
        assertThat(JsonPath.<String>read(view(nora, board), "$.view.deck.id")).isEqualTo(names);
        // Reworded, it is asked again: no match, nothing seen.
        change(nora, heist, "{\"text\":\"A heist, with subtitles\"}", 200);
        String asked = view(alex, board);
        assertThat(JsonPath.<Integer>read(asked, "$.view.decks[0].matches")).isZero();
        assertThat(JsonPath.<Integer>read(asked, "$.view.decks[0].seen")).isZero();
        assertThat(JsonPath.<List<Object>>read(today(alex, circle), "$.cards")).isEmpty();
        // Only its emoji changed: nothing is asked again.
        say(alex, board, heist, true);
        change(nora, heist, "{\"emoji\":\"🎬\"}", 200);
        assertThat(JsonPath.<Integer>read(view(alex, board), "$.view.decks[0].seen"))
                .isEqualTo(1);

        // Kai sees the board and isn't one of the people who answer: no say, no card, and no answer of his counts.
        assertThat(JsonPath.<Boolean>read(view(kai, board), "$.view.youAnswer")).isFalse();
        assertThat(act(kai, board, "say", "{\"ideaId\":\"%s\",\"yes\":true}".formatted(heist), 403))
                .contains("You aren't one of the people who answer here");
        act(nora, board, "say", "{\"ideaId\":\"%s\",\"yes\":true}".formatted(film), 404); // a deck is not an idea
        act(nora, board, "say", "{\"ideaId\":\"%s\",\"yes\":\"maybe\"}".formatted(heist), 400);
        // Who answers can't be changed once anyone has; a deck needs a name, an idea its words.
        send(
                HttpMethod.PATCH,
                "/v1/boards/" + board,
                nora,
                "{\"settings\":{\"people\":[\"%s\"]}}".formatted(alexId),
                409);
        add(nora, board, "deck", "{\"emoji\":\"🎬\"}", 400);
        add(nora, board, "idea", "{\"deckId\":\"%s\"}".formatted(film), 400);
        add(nora, board, "idea", "{\"deckId\":\"%s\",\"text\":\"Lost\"}".formatted(id()), 404);
        // A deck goes with its ideas and their answers.
        send(HttpMethod.DELETE, "/v1/board-entries/" + film, nora, null, 204);
        assertThat(jdbc.sql("select count(*) from board_entries where kind = 'say'")
                        .query(Integer.class)
                        .single())
                .isZero();
    }
}
