package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Secret Santa, tried as five people: the names are drawn by the API, each person is shown the one name they
 * drew and that person's wish list, and nothing else about the draw leaves the API by any route. Not for
 * whoever started the board either.
 */
class SecretSantaTest extends BoardTest {

    private static final List<String> NAMES = List.of("Lea", "Nora", "Kai", "Lena", "Ana");

    /** The wish only this person's own Santa may read. Its first word is found in nobody else's. */
    private static String wish(String name) {
        return "Jam" + name + " from the market";
    }

    @Test
    void eachPersonSeesOnlyTheOneNameTheyDrewAndNothingGivesAnotherPairingAway() throws Exception {
        Map<String, String> token = new LinkedHashMap<>();
        Map<String, String> member = new HashMap<>();
        for (String name : NAMES) {
            token.put(name, person(name));
        }
        String lea = token.get("Lea");
        String crew = circle(lea, "crew", "Lisbon crew");
        member.put("Lea", memberOf(lea, crew));
        for (String name : NAMES.subList(1, 5)) {
            member.put(name, join(lea, crew, token.get(name)));
        }
        String board =
                board(lea, crew, "secret_santa", null, "{\"budgetCents\":2500,\"swapAt\":\"the reunion dinner\"}");

        // Everyone starts in the hat. Lea and Kai are a couple; everyone writes a wish.
        add(
                lea,
                board,
                "apart",
                "{\"memberId\":\"%s\",\"otherMemberId\":\"%s\",\"why\":\"They're a couple\"}"
                        .formatted(member.get("Lea"), member.get("Kai")));
        for (String name : NAMES) {
            add(token.get(name), board, "wish", "{\"text\":\"%s\"}".formatted(wish(name)));
        }
        String before = view(token.get("Nora"), board);
        assertThat(JsonPath.<List<String>>read(before, "$.view.names[*].person.name"))
                .containsExactlyElementsOf(NAMES);
        assertThat(JsonPath.<Boolean>read(before, "$.view.drawn")).isFalse();
        assertThat(JsonPath.<Object>read(before, "$.view.yours")).isNull();
        assertThat(JsonPath.<List<String>>read(before, "$.view.myWishes[*].text"))
                .containsExactly(wish("Nora"));
        assertThat(JsonPath.<String>read(before, "$.view.apart[0].why")).isEqualTo("They're a couple");
        // Before the draw a wish list is its writer's alone.
        for (String other : NAMES.subList(0, 1)) {
            assertNowhere(token.get("Nora"), crew, board, wish(other));
        }
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/circles/" + crew + "/today", lea), "$.cards"))
                .isEmpty();

        // Nora presses "draw". It is no different for her than for anyone else.
        act(token.get("Nora"), board, "draw", "{}", 200);
        assertThat(act(lea, board, "draw", "{}", 409)).contains("The names are drawn");

        Map<String, String> drew = new HashMap<>();
        for (String name : NAMES) {
            String mine = view(token.get(name), board);
            assertThat(JsonPath.<Boolean>read(mine, "$.view.drawn")).isTrue();
            String receiver = JsonPath.read(mine, "$.view.yours.person.name");
            drew.put(name, receiver);
            // They read the wish list of the one they drew, and can find it. Their own is still theirs.
            assertThat(JsonPath.<List<String>>read(mine, "$.view.yours.wishes")).containsExactly(wish(receiver));
            assertThat(JsonPath.<List<String>>read(mine, "$.view.myWishes[*].text"))
                    .containsExactly(wish(name));
            assertThat(fetch("/v1/circles/" + crew + "/search?q=" + wish(receiver), token.get(name)))
                    .contains(board);
            // Nobody else's wish list is there for them, by any route.
            for (String other : NAMES) {
                if (!other.equals(name) && !other.equals(receiver)) {
                    assertNowhere(token.get(name), crew, board, wish(other));
                }
            }
            // The board, the thing and Today say the same to everyone, and name no pairing.
            assertThat(JsonPath.<String>read(fetch("/v1/things/" + board, token.get(name)), "$.glance"))
                    .endsWith("· 5 names in the hat")
                    .startsWith("Drawn on ");
            String today = fetch("/v1/circles/" + crew + "/today", token.get(name));
            assertThat(JsonPath.<List<String>>read(today, "$.cards[*].title"))
                    .containsExactly("Secret Santa has been drawn");
            assertThat(JsonPath.<String>read(today, "$.cards[0].line"))
                    .isEqualTo("You know yours. Nobody knows who has you.");
            assertThat(today).doesNotContain("Jam");
            // Nothing of the draw is listed, whatever is asked for.
            for (String query : List.of("", "?kind=drawn", "?kind=wish", "?member=" + member.get(name), "?q=Jam")) {
                assertThat(JsonPath.<List<Object>>read(
                                fetch("/v1/boards/" + board + "/entries" + query, token.get(name)), "$.items"))
                        .as(query)
                        .isEmpty();
            }
        }
        // It is a real draw: everyone gives once and receives once, nobody to themselves, the couple not to each other.
        assertThat(drew.values()).containsExactlyInAnyOrderElementsOf(NAMES);
        drew.forEach((giver, receiver) -> assertThat(receiver).isNotEqualTo(giver));
        assertThat(drew.get("Lea")).isNotEqualTo("Kai");
        assertThat(drew.get("Kai")).isNotEqualTo("Lea");

        // What one person gets tells them of one pairing only: their own. It holds no id of a pairing that
        // isn't theirs, and such an id leads nowhere.
        for (String name : NAMES) {
            String mine = view(token.get(name), board);
            for (String other : NAMES) {
                if (other.equals(name)) {
                    continue;
                }
                String theirReceiver = member.get(drew.get(other));
                String theirPairing = jdbc.sql(
                                "select cast(id as text) from board_entries where board_id = cast(:board as uuid) and kind = 'drawn' and for_id = cast(:giver as uuid)")
                        .param("board", board)
                        .param("giver", member.get(other))
                        .query(String.class)
                        .single();
                assertThat(mine)
                        .as(name + " is not told " + other + "'s pairing")
                        .doesNotContain(theirPairing);
                // The id of someone else's pairing leads nowhere: not to read, change or remove.
                change(token.get(name), theirPairing, "{\"to\":\"%s\"}".formatted(theirReceiver), 404);
                send(HttpMethod.DELETE, "/v1/board-entries/" + theirPairing, token.get(name), null, 404);
            }
            // The board holds what it should and no more: one "yours", and nothing that lists the draw.
            assertThat(JsonPath.<Map<String, Object>>read(mine, "$.view").keySet())
                    .containsExactlyInAnyOrder(
                            "drawn",
                            "drawnOn",
                            "names",
                            "inTheHat",
                            "apart",
                            "budgetCents",
                            "currency",
                            "swapOn",
                            "swapAt",
                            "swapThing",
                            "yours",
                            "myWishes");
            assertThat(JsonPath.<Map<String, Object>>read(mine, "$.view.yours").keySet())
                    .containsExactlyInAnyOrder("person", "wishes", "gotIt");
        }

        // "I've got it" is seen by nobody else, and once someone has their present the draw stays.
        String nora = token.get("Nora");
        String othersBefore = view(lea, board);
        assertThat(JsonPath.<Boolean>read(act(nora, board, "got_it", "{}", 200), "$.view.yours.gotIt"))
                .isTrue();
        assertThat(stripDates(view(lea, board))).isEqualTo(stripDates(othersBefore));
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/circles/" + crew + "/today", nora), "$.cards"))
                .isEmpty();
        assertThat(act(lea, board, "undo_draw", "{}", 409)).contains("Someone has their present already");
        act(nora, board, "got_it", "{\"got\":false}", 200);

        // The hat and the rules are closed while the names are drawn.
        String kaisName = JsonPath.<List<String>>read(view(lea, board), "$.view.names[?(@.person.name == 'Kai')].id")
                .get(0);
        assertThat(send(HttpMethod.DELETE, "/v1/board-entries/" + kaisName, lea, null, 409))
                .contains("Undo the draw first");
        add(
                lea,
                board,
                "apart",
                "{\"memberId\":\"%s\",\"otherMemberId\":\"%s\"}".formatted(member.get("Nora"), member.get("Ana")),
                409);

        // Undone, everyone is back to knowing nothing, and the wish lists are their writers' alone again.
        String undone = act(lea, board, "undo_draw", "{}", 200);
        assertThat(JsonPath.<Boolean>read(undone, "$.view.drawn")).isFalse();
        assertThat(JsonPath.<Object>read(undone, "$.view.yours")).isNull();
        assertNowhere(nora, crew, board, wish(drew.get("Nora")));
    }

    /** A board's answer without the moment it was last changed, to compare two of them. */
    private static String stripDates(String board) {
        return board.replaceAll("\"updatedAt\":\"[^\"]+\"", "");
    }

    @Test
    void rulesThatCantBeDrawnAreAnsweredWithASentenceAndOnlyPeopleWithASignInAreInTheHat() throws Exception {
        String lea = person("Lea");
        String nora = person("Nora");
        String kai = person("Kai");
        String crew = circle(lea, "crew", "Three of us");
        String leaId = memberOf(lea, crew);
        String noraId = join(lea, crew, nora);
        String kaiId = join(lea, crew, kai);
        String child = addMember(lea, crew, "Mia", "child");
        String board = board(lea, crew, "secret_santa", null, null);
        String hat = view(lea, board);
        // The child has no sign-in: the name she drew could be shown to nobody, so she isn't in the hat.
        assertThat(JsonPath.<List<String>>read(hat, "$.view.names[*].person.name"))
                .containsExactly("Lea", "Nora", "Kai");
        assertThat(add(lea, board, "name", "{\"memberId\":\"%s\"}".formatted(child), 400))
                .contains("Only someone with their own sign-in can be in the hat");
        // Someone who is in it already is in it once.
        add(lea, board, "name", "{\"memberId\":\"%s\"}".formatted(noraId));
        assertThat(JsonPath.<Integer>read(view(lea, board), "$.view.names.length()"))
                .isEqualTo(3);

        // Three people, two of them kept apart: both would have to draw the third.
        String rule =
                add(lea, board, "apart", "{\"memberId\":\"%s\",\"otherMemberId\":\"%s\"}".formatted(leaId, kaiId));
        add(lea, board, "apart", "{\"memberId\":\"%s\",\"otherMemberId\":\"%s\"}".formatted(leaId, leaId), 400);
        add(lea, board, "apart", "{\"memberId\":\"%s\",\"otherMemberId\":\"%s\"}".formatted(leaId, child), 400);
        assertThat(act(lea, board, "draw", "{}", 409))
                .contains("With these rules the names can't be drawn")
                .contains("Take a rule away, or add a name.");
        assertThat(JsonPath.<Boolean>read(view(nora, board), "$.view.drawn")).isFalse();
        send(HttpMethod.DELETE, "/v1/board-entries/" + rule, lea, null, 204);

        // With two names each would know who has them.
        String kaisName = JsonPath.<List<String>>read(hat, "$.view.names[?(@.person.name == 'Kai')].id")
                .get(0);
        send(HttpMethod.DELETE, "/v1/board-entries/" + kaisName, lea, null, 204);
        assertThat(act(lea, board, "draw", "{}", 409)).contains("A draw needs at least three names");
        assertThat(act(kai, board, "got_it", "{}", 409)).contains("The names aren't drawn yet");

        // Back in the hat, three can be drawn; Kai, who was taken out and put back, has a name like the others.
        add(lea, board, "name", "{\"memberId\":\"%s\"}".formatted(kaiId));
        act(lea, board, "draw", "{}", 200);
        for (String who : List.of(lea, nora, kai)) {
            assertThat(JsonPath.<String>read(view(who, board), "$.view.yours.person.name"))
                    .isIn("Lea", "Nora", "Kai");
        }
        // A wish is changed and removed by its writer only; to anyone else it isn't there.
        String wish = add(nora, board, "wish", "{\"text\":\"Walking socks\"}");
        change(kai, wish, "{\"text\":\"Coal\"}", 404);
        send(HttpMethod.DELETE, "/v1/board-entries/" + wish, lea, null, 404);
        change(nora, wish, "{\"text\":\"Good walking socks\"}", 200);
        assertThat(JsonPath.<List<String>>read(view(nora, board), "$.view.myWishes[*].text"))
                .containsExactly("Good walking socks");
    }
}
