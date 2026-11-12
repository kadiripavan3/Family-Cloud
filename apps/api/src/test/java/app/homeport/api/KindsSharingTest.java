package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * The flat's and the crew's thirteen templates are boards like any other: each one is seen and changed by
 * the one sharing rule, through every route that reaches it, and starting the same one twice makes one.
 */
class KindsSharingTest extends BoardTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);

    /** Each template with the least it needs to start. */
    private static Map<String, String> templates() {
        Map<String, String> templates = new LinkedHashMap<>();
        for (String plain : new String[] {
            "kitty",
            "fairer_split",
            "heads_up",
            "heard",
            "guest_book",
            "lived_here",
            "find_date",
            "secret_santa",
            "where_next",
            "dictionary",
            "awards"
        }) {
            templates.put(plain, "{}");
        }
        templates.put("predictions", "{\"opensOn\":\"%s\"}".formatted(TODAY.plusYears(1)));
        templates.put("walk_together", "{\"goal\":100000}");
        return templates;
    }

    @Test
    void everyOneOfTheThirteenIsSeenAndChangedByTheSameRuleAsEverythingElse() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String stranger = person("Stranger");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        assertThat(templates()).hasSize(13);

        for (Map.Entry<String, String> template : templates().entrySet()) {
            String name = template.getKey();
            // Started twice with the same clientId: one board.
            String create =
                    "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"%s\",\"title\":\"Zanzibar %s\",\"settings\":%s}"
                            .formatted(id(), circle, name, name, template.getValue());
            String board = JsonPath.read(send(HttpMethod.POST, "/v1/boards", nora, create, 201), "$.id");
            assertThat(JsonPath.<String>read(send(HttpMethod.POST, "/v1/boards", nora, create, 201), "$.id"))
                    .as(name)
                    .isEqualTo(board);
            assertThat(JsonPath.<Integer>read(
                            fetch("/v1/circles/" + circle + "/boards?template=" + name, nora), "$.items.length()"))
                    .as(name)
                    .isEqualTo(1);
            // In a family it starts as hers alone, and has a few words to say where it stands.
            assertThat(JsonPath.<String>read(view(nora, board), "$.chip.audience"))
                    .isEqualTo("me");
            assertThat(JsonPath.<String>read(fetch("/v1/things/" + board, nora), "$.glance"))
                    .as(name)
                    .isNotBlank();
            assertThat(fetch("/v1/circles/" + circle + "/today", nora)).as(name).isNotNull();

            // A stranger, and someone in the circle it isn't shared with, learn nothing by any route.
            for (String outside : new String[] {stranger, alex}) {
                assertThat(statusOf("/v1/boards/" + board, outside)).as(name).isEqualTo(404);
                assertThat(statusOf("/v1/boards/" + board + "/entries", outside))
                        .as(name)
                        .isEqualTo(404);
                assertThat(statusOf("/v1/things/" + board, outside)).as(name).isEqualTo(404);
                act(outside, board, "anything", "{}", 404);
                add(outside, board, "anything", "{}", 404);
                send(HttpMethod.PATCH, "/v1/boards/" + board, outside, "{\"title\":\"Peek\"}", 404);
            }
            assertThat(fetch("/v1/circles/" + circle + "/boards", alex))
                    .as(name)
                    .doesNotContain(board);
            assertThat(fetch("/v1/circles/" + circle + "/search?q=Zanzibar", alex))
                    .as(name)
                    .doesNotContain(board);
            assertThat(fetch("/v1/circles/" + circle + "/today", alex)).as(name).doesNotContain(board);

            // Shared to look at: he sees it everywhere, and can't change it.
            shareWith(nora, board, alexId, "view");
            String seen = view(alex, board);
            assertThat(JsonPath.<Boolean>read(seen, "$.canEdit")).as(name).isFalse();
            assertThat(JsonPath.<String>read(seen, "$.template")).isEqualTo(name);
            assertThat(fetch("/v1/circles/" + circle + "/boards", alex))
                    .as(name)
                    .contains(board);
            assertThat(fetch("/v1/circles/" + circle + "/search?q=Zanzibar", alex))
                    .as(name)
                    .contains(board);
            send(HttpMethod.PATCH, "/v1/boards/" + board, alex, "{\"title\":\"Mine now\"}", 403);
            send(HttpMethod.PATCH, "/v1/boards/" + board, alex, "{\"settings\":{}}", 403);
            assertThat(statusOf("/v1/boards/" + board, stranger)).as(name).isEqualTo(404);

            // Deleted like any thing, with everything in it.
            send(HttpMethod.DELETE, "/v1/things/" + board, alex, null, 403);
            send(HttpMethod.DELETE, "/v1/things/" + board, nora, null, 204);
            assertThat(statusOf("/v1/boards/" + board, nora)).as(name).isEqualTo(404);
        }
        assertThat(jdbc.sql("select count(*) from board_entries")
                        .query(Integer.class)
                        .single())
                .isZero();
    }

    @Test
    void someoneWhoMayOnlyLookStillDoesWhatIsTheirOwnToDoAndNothingElse() throws Exception {
        String lea = person("Lea");
        String kai = person("Kai");
        String crew = circle(lea, "crew", "Lisbon crew");
        String kaiId = join(lea, crew, kai);
        String leaId = memberOf(lea, crew);

        // A kitty he may only look at: he can't write a line into it.
        String kitty = board(lea, crew, "kitty", "me", null);
        shareWith(lea, kitty, kaiId, "view");
        add(kai, kitty, "in", "{}", 403);
        act(kai, kitty, "low", "{\"itemId\":\"%s\"}".formatted(id()), 403);

        // A heads-up he may only look at: he can't write one, but he answers Lea's.
        String headsUp = board(lea, crew, "heads_up", "me", null);
        String notice = add(lea, headsUp, "notice", "{\"text\":\"Friends over on Friday\"}");
        shareWith(lea, headsUp, kaiId, "view");
        add(kai, headsUp, "notice", "{\"text\":\"Me too\"}", 403);
        act(kai, headsUp, "answer", "{\"noticeId\":\"%s\",\"says\":\"fine\"}".formatted(notice), 200);

        // A split he may only look at: he can't propose, but his yes is his own.
        String split = board(lea, crew, "fairer_split", "me", null);
        add(lea, split, "split", "{\"name\":\"Internet\",\"way\":\"equal\",\"totalCents\":3000}");
        shareWith(lea, split, kaiId, "view");
        String proposal = JsonPath.read(view(kai, split), "$.view.splits[0].proposed.id");
        act(kai, split, "propose", "{\"splitId\":\"%s\",\"totalCents\":1}".formatted(id()), 403);
        assertThat(JsonPath.<Object>read(
                        act(kai, split, "agree", "{\"proposalId\":\"%s\"}".formatted(proposal), 200),
                        "$.view.splits[0].agreed.id"))
                .isEqualTo(proposal);

        // Awards and a vote he may only look at: he can't add a category or an idea, but he votes.
        String awards = board(lea, crew, "awards", "me", null);
        String award = add(lea, awards, "award", "{\"name\":\"Best laugh\"}");
        String nominee =
                add(lea, awards, "nominee", "{\"awardId\":\"%s\",\"memberId\":\"%s\"}".formatted(award, leaId));
        shareWith(lea, awards, kaiId, "view");
        add(kai, awards, "award", "{\"name\":\"Mine\"}", 403);
        act(kai, awards, "decide", "{\"awardId\":\"%s\"}".formatted(award), 403);
        act(kai, awards, "vote", "{\"nomineeId\":\"%s\"}".formatted(nominee), 200);
        String whereNext = board(lea, crew, "where_next", "me", null);
        String idea = add(lea, whereNext, "idea", "{\"name\":\"Porto\"}");
        shareWith(lea, whereNext, kaiId, "view");
        add(kai, whereNext, "idea", "{\"name\":\"Sicily\"}", 403);
        act(kai, whereNext, "close", "{}", 403);
        act(kai, whereNext, "vote", "{\"ideaId\":\"%s\"}".formatted(idea), 200);

        // Predictions and a wish list: writing his own is his to do. Drawing the names is not.
        String predictions =
                board(lea, crew, "predictions", "me", "{\"opensOn\":\"%s\"}".formatted(TODAY.plusYears(1)));
        shareWith(lea, predictions, kaiId, "view");
        add(
                kai,
                predictions,
                "prediction",
                "{\"aboutMemberId\":\"%s\",\"text\":\"Still organising us\"}".formatted(leaId));
        String santa = board(lea, crew, "secret_santa", "me", null);
        shareWith(lea, santa, kaiId, "view");
        add(kai, santa, "wish", "{\"text\":\"A travel mug\"}");
        act(kai, santa, "draw", "{}", 403);
        add(kai, santa, "apart", "{\"memberId\":\"%s\",\"otherMemberId\":\"%s\"}".formatted(leaId, kaiId), 403);
    }
}
