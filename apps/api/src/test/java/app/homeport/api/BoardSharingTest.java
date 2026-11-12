package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * A board is a thing like any other: the one sharing rule decides who sees it, through every route that
 * reaches it. What each person sees inside it is the template's business and has tests of its own.
 */
class BoardSharingTest extends BoardTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);

    /** True when this person can reach the board by any of the ways there are. They must all agree. */
    private boolean sees(String token, String circle, String board) throws Exception {
        boolean byId = statusOf("/v1/boards/" + board, token) == 200;
        List<Boolean> all = List.of(
                byId,
                statusOf("/v1/boards/" + board + "/entries", token) == 200,
                statusOf("/v1/things/" + board, token) == 200,
                statusOf("/v1/things/" + board + "/audience", token) == 200,
                fetch("/v1/circles/" + circle + "/boards", token).contains(board),
                fetch("/v1/circles/" + circle + "/boards?template=meal_plan", token)
                        .contains(board),
                fetch("/v1/circles/" + circle + "/search?q=Weekly", token).contains(board),
                fetch("/v1/circles/" + circle + "/search?q=Zanzibar", token).contains(board),
                fetch("/v1/circles/" + circle + "/today", token).contains(board));
        assertThat(all).as("every way to reach the board gives the same answer").containsOnly(byId);
        return byId;
    }

    @Test
    void aBoardIsSeenAndChangedByTheSameRuleAsEverythingElse() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String stranger = person("Stranger");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String kaiId = join(nora, circle, kai);

        // In a family it starts as hers alone. It has a meal tonight, so it has something for Today and for search.
        String plan = board(nora, circle, "meal_plan", null, null);
        String meal = add(nora, plan, "meal", "{\"day\":\"%s\",\"name\":\"Zanzibar stew\"}".formatted(TODAY));
        assertThat(JsonPath.<String>read(view(nora, plan), "$.chip.audience")).isEqualTo("me");
        assertThat(JsonPath.<Boolean>read(view(nora, plan), "$.mine")).isTrue();
        assertThat(sees(nora, circle, plan)).isTrue();

        // A stranger learns nothing, by any route, and can change nothing.
        assertThat(statusOf("/v1/boards/" + plan, stranger)).isEqualTo(404);
        assertThat(statusOf("/v1/boards/" + plan + "/entries", stranger)).isEqualTo(404);
        assertThat(statusOf("/v1/circles/" + circle + "/boards", stranger)).isEqualTo(404);
        assertThat(statusOf("/v1/circles/" + circle + "/templates", stranger)).isEqualTo(404);
        add(stranger, plan, "meal", "{\"day\":\"%s\",\"name\":\"Peek\"}".formatted(TODAY), 404);
        change(stranger, meal, "{\"name\":\"Peek\"}", 404);
        send(HttpMethod.DELETE, "/v1/board-entries/" + meal, stranger, null, 404);
        act(stranger, plan, "anything", "{}", 404);
        send(HttpMethod.PATCH, "/v1/boards/" + plan, stranger, "{\"title\":\"Peek\"}", 404);
        newBoard(stranger, circle, "meal_plan", null, null, 404);

        // Someone in the circle it isn't shared with: the same.
        assertThat(sees(alex, circle, plan)).isFalse();
        add(alex, plan, "meal", "{\"day\":\"%s\",\"name\":\"Peek\"}".formatted(TODAY), 404);
        change(alex, meal, "{\"name\":\"Peek\"}", 404);
        send(HttpMethod.DELETE, "/v1/board-entries/" + meal, alex, null, 404);
        act(alex, plan, "anything", "{}", 404);
        send(HttpMethod.PATCH, "/v1/boards/" + plan, alex, "{\"title\":\"Peek\"}", 404);

        // Shared to look at: he sees it everywhere and can change nothing.
        shareWith(nora, plan, alexId, "view");
        assertThat(sees(alex, circle, plan)).isTrue();
        assertThat(sees(kai, circle, plan)).isFalse();
        assertThat(JsonPath.<Boolean>read(view(alex, plan), "$.canEdit")).isFalse();
        add(alex, plan, "meal", "{\"day\":\"%s\",\"name\":\"Mine\"}".formatted(TODAY), 403);
        change(alex, meal, "{\"name\":\"Mine\"}", 403);
        send(HttpMethod.DELETE, "/v1/board-entries/" + meal, alex, null, 403);
        act(alex, plan, "anything", "{}", 403);
        send(HttpMethod.PATCH, "/v1/boards/" + plan, alex, "{\"settings\":{\"cookingFor\":9}}", 403);
        send(HttpMethod.DELETE, "/v1/things/" + plan, alex, null, 403);

        // Shared to edit: he can.
        shareWith(nora, plan, alexId, "edit");
        change(alex, meal, "{\"note\":\"Alex is hungry\"}", 200);
        assertThat(view(nora, plan)).contains("Alex is hungry");

        // With everyone, except Kai until tomorrow.
        send(
                HttpMethod.PUT,
                "/v1/things/" + plan + "/audience",
                nora,
                "{\"audience\":\"circle\",\"hiddenFrom\":[{\"memberId\":\"%s\",\"through\":\"%s\"}]}"
                        .formatted(kaiId, TODAY.plusDays(1)),
                200);
        assertThat(sees(alex, circle, plan)).isTrue();
        assertThat(sees(kai, circle, plan)).isFalse();
        assertThat(JsonPath.<List<String>>read(view(alex, plan), "$.chip.hiddenFrom"))
                .containsExactly("Kai");

        // Deleting is the shared route; its entries go with it.
        send(HttpMethod.DELETE, "/v1/things/" + plan, nora, null, 204);
        assertThat(statusOf("/v1/boards/" + plan, nora)).isEqualTo(404);
        assertThat(jdbc.sql("select count(*) from board_entries")
                        .query(Integer.class)
                        .single())
                .isZero();
    }

    @Test
    void sendingTheSameCreateTwiceMakesOneBoardAndTheSameEntryTwiceMakesOneEntry() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String body =
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"birthday_interview\",\"settings\":{\"forMemberId\":\"%s\"}}"
                        .formatted(
                                id(),
                                circle,
                                JsonPath.<String>read(
                                        send(
                                                HttpMethod.POST,
                                                "/v1/circles/" + circle + "/members",
                                                nora,
                                                "{\"clientId\":\"%s\",\"name\":\"Mia\",\"kind\":\"child\",\"birthday\":\"2016-12-04\"}"
                                                        .formatted(id()),
                                                201),
                                        "$.id"));

        String first = send(HttpMethod.POST, "/v1/boards", nora, body, 201);
        String second = send(HttpMethod.POST, "/v1/boards", nora, body, 201);

        String board = JsonPath.read(first, "$.id");
        assertThat(JsonPath.<String>read(second, "$.id")).isEqualTo(board);
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle + "/boards", nora), "$.items.length()"))
                .isEqualTo(1);
        // The ten questions it starts with were put in once.
        assertThat(JsonPath.<Integer>read(second, "$.view.questions.length()")).isEqualTo(10);
        assertThat(JsonPath.<String>read(second, "$.title")).isEqualTo("The birthday interview");

        String entry =
                "{\"clientId\":\"%s\",\"kind\":\"question\",\"fields\":{\"text\":\"What is your favourite word?\"}}"
                        .formatted(id());
        String once = send(HttpMethod.POST, "/v1/boards/" + board + "/entries", nora, entry, 201);
        String twice = send(HttpMethod.POST, "/v1/boards/" + board + "/entries", nora, entry, 201);
        assertThat(JsonPath.<String>read(twice, "$.entryId")).isEqualTo(JsonPath.<String>read(once, "$.entryId"));
        assertThat(JsonPath.<Integer>read(twice, "$.board.view.questions.length()"))
                .isEqualTo(11);

        // Removing an entry twice is fine, and one that never was is fine too.
        String id = JsonPath.read(once, "$.entryId");
        send(HttpMethod.DELETE, "/v1/board-entries/" + id, nora, null, 204);
        send(HttpMethod.DELETE, "/v1/board-entries/" + id, nora, null, 204);
        send(HttpMethod.DELETE, "/v1/board-entries/" + id(), nora, null, 204);
        change(nora, id, "{\"text\":\"Gone\"}", 404);
    }

    @Test
    void aBoardCanOnlyBeMadeOfATemplateThatDoesWorkAndWhoseRulesAreBuilt() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");

        assertThat(newBoard(nora, circle, "whose_turn", null, null, 409))
                .contains("coming_soon")
                .contains("“Whose turn?” is coming with the next update");
        assertThat(newBoard(nora, circle, "house_manual", null, null, 400)).contains("starts as pages and lists");
        assertThat(newBoard(nora, circle, "teleporter", null, null, 400)).contains("That isn't a template we have");
        assertThat(newBoard(nora, circle, "time_capsule", null, null, 400)).contains("Choose the day it opens");
        assertThat(add(nora, board(nora, circle, "said", null, null), "sandwich", "{}", 400))
                .contains("That can't be added to this template");
        assertThat(act(nora, board(nora, circle, "said", null, null), "juggle", "{}", 400))
                .contains("That can't be done with this template");
    }

    @Test
    void aBoardOnAGuestPassShowsOnlyWhatItsTemplateLetsAGuestRead() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String plan = board(nora, circle, "meal_plan", "circle", null);
        add(nora, plan, "meal", "{\"day\":\"%s\",\"name\":\"Zanzibar stew\"}".formatted(TODAY));
        String capsule =
                board(nora, circle, "time_capsule", "circle", "{\"opensOn\":\"%s\"}".formatted(TODAY.plusYears(1)));
        add(nora, capsule, "letter", "{\"text\":\"Pineapple under the stairs\"}");

        String pass = send(
                HttpMethod.POST,
                "/v1/circles/" + circle + "/guest-passes",
                nora,
                "{\"clientId\":\"%s\",\"guestName\":\"Ines\",\"endsAt\":\"%s\",\"thingIds\":[\"%s\",\"%s\"]}"
                        .formatted(id(), java.time.Instant.now().plusSeconds(3600), plan, capsule),
                201);
        String path = JsonPath.<String>read(pass, "$.url").replaceFirst("^https?://[^/]+", "");
        String page = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path)
                        .param("code", JsonPath.<String>read(pass, "$.code")))
                .andReturn()
                .getResponse()
                .getContentAsString();

        // The sitter reads what is for dinner; of the capsule she gets its name and nothing from inside.
        assertThat(page).contains("Zanzibar stew").contains("Time capsule").doesNotContain("Pineapple");
    }
}
