package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;

/** What the tests of boards share: making one, adding to it, a verb, and looking for a secret everywhere. */
abstract class BoardTest extends ApiTest {

    /** Starts a board of this template. With a null audience it starts as the circle's kind says. Returns its id. */
    protected String board(String token, String circle, String template, String audience, String settings)
            throws Exception {
        return JsonPath.read(newBoard(token, circle, template, audience, settings, 201), "$.id");
    }

    protected String newBoard(
            String token, String circle, String template, String audience, String settings, int expected)
            throws Exception {
        return send(
                HttpMethod.POST,
                "/v1/boards",
                token,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"%s\"%s,\"settings\":%s}"
                        .formatted(
                                id(),
                                circle,
                                template,
                                audience == null ? "" : ",\"audience\":\"" + audience + "\"",
                                settings == null ? "{}" : settings),
                expected);
    }

    /** Adds an entry and returns its id. */
    protected String add(String token, String board, String kind, String fields) throws Exception {
        return JsonPath.read(add(token, board, kind, fields, 201), "$.entryId");
    }

    protected String add(String token, String board, String kind, String fields, int expected) throws Exception {
        return send(
                HttpMethod.POST,
                "/v1/boards/" + board + "/entries",
                token,
                "{\"clientId\":\"%s\",\"kind\":\"%s\",\"fields\":%s}".formatted(id(), kind, fields),
                expected);
    }

    protected String change(String token, String entry, String fields, int expected) throws Exception {
        return send(HttpMethod.PATCH, "/v1/board-entries/" + entry, token, "{\"fields\":" + fields + "}", expected);
    }

    protected String act(String token, String board, String verb, String body, int expected) throws Exception {
        return send(
                HttpMethod.POST,
                "/v1/boards/" + board + "/act",
                token,
                "{\"verb\":\"%s\",\"body\":%s}".formatted(verb, body),
                expected);
    }

    protected String view(String token, String board) throws Exception {
        return fetch("/v1/boards/" + board, token);
    }

    protected String memberOf(String token, String circle) throws Exception {
        return JsonPath.read(fetch("/v1/circles/" + circle, token), "$.myMemberId");
    }

    /** Shares a thing with some people: each pair is a member id and "view" or "edit". */
    protected void shareWith(String owner, String thing, String... memberAndAccess) throws Exception {
        StringBuilder people = new StringBuilder();
        for (int i = 0; i < memberAndAccess.length; i += 2) {
            people.append(i == 0 ? "" : ",")
                    .append("{\"memberId\":\"%s\",\"access\":\"%s\"}"
                            .formatted(memberAndAccess[i], memberAndAccess[i + 1]));
        }
        send(
                HttpMethod.PUT,
                "/v1/things/" + thing + "/audience",
                owner,
                "{\"audience\":\"some\",\"people\":[" + people + "]}",
                200);
    }

    /** Uploads a short recording the way the app does. Returns the media id. */
    protected String recording(String token, int seconds) throws Exception {
        String target = mvc.perform(post("/v1/media/uploads")
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"kind\":\"audio\",\"contentType\":\"audio/mp4\",\"durationSeconds\":%d}"
                                .formatted(seconds)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        mvc.perform(put(java.net.URI.create(JsonPath.<String>read(target, "$.uploadUrl")))
                        .contentType(MediaType.valueOf("audio/mp4"))
                        .content(new byte[] {1, 2, 3, 4, 5, 6, 7, 8}))
                .andExpect(status().isNoContent());
        String id = JsonPath.read(target, "$.mediaId");
        mvc.perform(post("/v1/media/uploads/" + id + "/complete").header("Authorization", token))
                .andExpect(status().isNoContent());
        return id;
    }

    protected int statusOf(String path, String token) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(path)
                        .header("Authorization", token))
                .andReturn()
                .getResponse()
                .getStatus();
    }

    /**
     * Looks for words that must stay secret from this person in every answer that could carry them: the board,
     * its list of entries, the circle's boards, search (by the words themselves), Today, and the thing itself.
     */
    protected void assertNowhere(String token, String circle, String board, String secret) throws Exception {
        String firstWord = secret.split(" ")[0];
        for (String path : List.of(
                "/v1/boards/" + board,
                "/v1/boards/" + board + "/entries",
                "/v1/boards/" + board + "/entries?q=" + firstWord,
                "/v1/circles/" + circle + "/boards",
                "/v1/circles/" + circle + "/today",
                "/v1/things/" + board)) {
            assertThat(fetch(path, token)).as(path).doesNotContain(secret);
        }
        // Search says back what was typed, so it is the hits that are looked at: the board isn't found by the secret.
        for (String words : List.of(firstWord, secret)) {
            String found = fetch("/v1/circles/" + circle + "/search?q=" + words, token);
            assertThat(JsonPath.<List<Object>>read(found, "$.hits[?(@.thing.id == '" + board + "')]"))
                    .as("searching for \"" + words + "\"")
                    .isEmpty();
        }
        assertThat(JsonPath.<List<Object>>read(
                        fetch("/v1/boards/" + board + "/entries?q=" + firstWord, token), "$.items"))
                .as("the board's own search for \"" + firstWord + "\"")
                .isEmpty();
    }

    /** Moves a date inside a board's settings: how these tests let time pass. */
    protected void setSetting(String board, String name, String value) {
        jdbc.sql(
                        "update boards set settings = jsonb_set(settings, cast(:path as text[]), to_jsonb(cast(:value as text))) where thing_id = cast(:id as uuid)")
                .param("path", "{" + name + "}")
                .param("value", value)
                .param("id", board)
                .update();
    }
}
