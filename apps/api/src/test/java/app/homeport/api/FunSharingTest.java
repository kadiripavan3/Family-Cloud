package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jayway.jsonpath.JsonPath;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;

/**
 * The thirteen fair-and-fun and couple's templates are boards like any other: the one sharing rule decides who
 * reaches them, through every route. What some of them let "anyone who sees the board" do (tear a link, say
 * yes, tuck a note away) is for people the board is shared with, never for anyone else.
 */
class FunSharingTest extends FunBoardTest {

    /** What each template lets someone do who may only look at its board: its verbs, and the kinds they may add. */
    private static final Map<String, List<String>> OPEN_VERBS = Map.ofEntries(
            Map.entry("whose_turn", List.of()),
            Map.entry("piggy_bank", List.of()),
            Map.entry("secret_missions", List.of("done", "another", "like", "reply")),
            Map.entry("saturday_jar", List.of("shake", "do")),
            Map.entry("sleeps", List.of("tear")),
            Map.entry("where_is_it", List.of("seen")),
            Map.entry("habit_charts", List.of("tick")),
            Map.entry("our_story", List.of()),
            Map.entry("tucked_notes", List.of("found")),
            Map.entry("anniversary", List.of()),
            Map.entry("mystery_date", List.of()),
            Map.entry("both_yes", List.of("say")),
            Map.entry("fair_share", List.of("tick", "suggest", "answer")));

    private static final Map<String, List<String>> OPEN_KINDS = Map.of(
            "secret_missions", List.of("mission"),
            "saturday_jar", List.of("idea"),
            "tucked_notes", List.of("note"),
            "anniversary", List.of("answer"),
            "mystery_date", List.of("idea"));

    private int status(HttpMethod method, String path, String token, String json) throws Exception {
        var request = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request(method, path)
                .header("Authorization", token);
        if (json != null) {
            request = request.contentType(MediaType.APPLICATION_JSON).content(json);
        }
        return mvc.perform(request).andReturn().getResponse().getStatus();
    }

    /** What a POST answers, whatever its status. */
    private String posted(String path, String token, String json) throws Exception {
        return mvc.perform(post(path)
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andReturn()
                .getResponse()
                .getContentAsString();
    }

    @Test
    void everyOneOfThemIsReachedByTheSameRuleAsEveryOtherThing() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String stranger = person("Stranger");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String mia = addMember(nora, circle, "Mia", "child");

        // In a family each starts as hers alone.
        Map<String, String> boards = new LinkedHashMap<>();
        for (String template : OPEN_VERBS.keySet().stream().sorted().toList()) {
            String settings = switch (template) {
                case "piggy_bank" -> "{\"forMemberId\":\"%s\"}".formatted(mia);
                case "anniversary" -> "{\"since\":\"%s\"}".formatted(TODAY.minusYears(3));
                default -> "{}";
            };
            String made = newBoard(nora, circle, template, null, settings, 201);
            assertThat(JsonPath.<String>read(made, "$.chip.audience"))
                    .as(template)
                    .isEqualTo("me");
            boards.put(template, JsonPath.read(made, "$.id"));
        }
        assertThat(boards).hasSize(13);

        // A stranger, and Alex who is in the circle but wasn't shown them: not there, by any route, for any verb.
        for (var board : boards.entrySet()) {
            String template = board.getKey();
            String id = board.getValue();
            for (String who : List.of(stranger, alex)) {
                assertThat(statusOf("/v1/boards/" + id, who)).as(template).isEqualTo(404);
                assertThat(statusOf("/v1/boards/" + id + "/entries", who))
                        .as(template)
                        .isEqualTo(404);
                assertThat(statusOf("/v1/things/" + id, who)).as(template).isEqualTo(404);
                assertThat(status(HttpMethod.PATCH, "/v1/boards/" + id, who, "{\"title\":\"Peek\"}"))
                        .as(template)
                        .isEqualTo(404);
                for (String verb : OPEN_VERBS.get(template)) {
                    assertThat(status(
                                    HttpMethod.POST,
                                    "/v1/boards/" + id + "/act",
                                    who,
                                    "{\"verb\":\"%s\",\"body\":{}}".formatted(verb)))
                            .as(template + " " + verb)
                            .isEqualTo(404);
                }
                for (String kind : OPEN_KINDS.getOrDefault(template, List.of())) {
                    assertThat(status(
                                    HttpMethod.POST,
                                    "/v1/boards/" + id + "/entries",
                                    who,
                                    "{\"clientId\":\"%s\",\"kind\":\"%s\",\"fields\":{\"text\":\"Peek\"}}"
                                            .formatted(id(), kind)))
                            .as(template + " " + kind)
                            .isEqualTo(404);
                }
            }
            assertThat(fetch("/v1/circles/" + circle + "/boards", alex))
                    .as(template)
                    .doesNotContain(id);
            assertThat(fetch("/v1/circles/" + circle + "/today", alex))
                    .as(template)
                    .doesNotContain(id);
        }
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/circles/" + circle + "/search?q=piggy", alex), "$.hits"))
                .isEmpty();

        // Shown to Alex to look at: he sees each one; what it lets everyone do he may do; the rest he may not.
        for (var board : boards.entrySet()) {
            String template = board.getKey();
            String id = board.getValue();
            shareWith(nora, id, alexId, "view");
            String seen = view(alex, id);
            assertThat(JsonPath.<Boolean>read(seen, "$.canEdit")).as(template).isFalse();
            assertThat(JsonPath.<String>read(seen, "$.template")).isEqualTo(template);
            assertThat(fetch("/v1/circles/" + circle + "/boards?template=" + template, alex))
                    .contains(id);
            assertThat(status(HttpMethod.PATCH, "/v1/boards/" + id, alex, "{\"title\":\"Mine now\"}"))
                    .as(template)
                    .isEqualTo(403);
            assertThat(posted("/v1/boards/" + id + "/act", alex, "{\"verb\":\"juggle\",\"body\":{}}"))
                    .as(template)
                    .contains("view_only");
            for (String verb : OPEN_VERBS.get(template)) {
                assertThat(posted("/v1/boards/" + id + "/act", alex, "{\"verb\":\"%s\",\"body\":{}}".formatted(verb)))
                        .as(template + " " + verb)
                        .doesNotContain("view_only");
            }
            for (String kind : OPEN_KINDS.getOrDefault(template, List.of())) {
                assertThat(posted(
                                "/v1/boards/" + id + "/entries",
                                alex,
                                "{\"clientId\":\"%s\",\"kind\":\"%s\",\"fields\":{}}".formatted(id(), kind)))
                        .as(template + " " + kind)
                        .doesNotContain("view_only");
            }
            // Anything else he may not add.
            assertThat(posted(
                            "/v1/boards/" + id + "/entries",
                            alex,
                            "{\"clientId\":\"%s\",\"kind\":\"sandwich\",\"fields\":{}}".formatted(id())))
                    .as(template)
                    .contains("view_only");
        }

        // Deleting is the shared route, and takes everything on the board with it.
        for (String id : boards.values()) {
            send(HttpMethod.DELETE, "/v1/things/" + id, alex, null, 403);
            send(HttpMethod.DELETE, "/v1/things/" + id, nora, null, 204);
        }
        assertThat(jdbc.sql("select count(*) from board_entries")
                        .query(Integer.class)
                        .single())
                .isZero();
    }
}
