package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.springframework.http.HttpMethod;

/**
 * What the tests of the fair-and-fun and the couple's templates share: today, a teenager, a guest's page, and
 * looking for a secret through every route there is.
 */
abstract class FunBoardTest extends BoardTest {

    protected static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);

    protected String today(String token, String circle) throws Exception {
        return fetch("/v1/circles/" + circle + "/today?day=" + TODAY, token);
    }

    /** Lets someone into a family as a teenager: they sign in themselves, and they aren't one of the grown-ups. */
    protected String teen(String owner, String circle, String token) throws Exception {
        String id = join(owner, circle, token);
        send(HttpMethod.PATCH, "/v1/members/" + id, owner, "{\"role\":\"teen\"}", 200);
        return id;
    }

    /** What someone outside the circle reads with a guest pass for these things. */
    protected String guestPage(String owner, String circle, String... things) throws Exception {
        String pass = send(
                HttpMethod.POST,
                "/v1/circles/" + circle + "/guest-passes",
                owner,
                "{\"clientId\":\"%s\",\"guestName\":\"Ines\",\"endsAt\":\"%s\",\"thingIds\":[\"%s\"]}"
                        .formatted(id(), Instant.now().plusSeconds(3600), String.join("\",\"", things)),
                201);
        String path = JsonPath.<String>read(pass, "$.url").replaceFirst("^https?://[^/]+", "");
        return mvc.perform(post(path).param("code", JsonPath.<String>read(pass, "$.code")))
                .andReturn()
                .getResponse()
                .getContentAsString();
    }

    /**
     * Words that must stay secret from this person: looked for in the board, its entries, the circle's boards
     * (the glance), search, Today and the thing itself, on the phone's day and on a phone set ahead, and on a
     * guest's page.
     */
    protected void assertSecret(String token, String owner, String circle, String board, String secret)
            throws Exception {
        assertNowhere(token, circle, board, secret);
        for (String path : List.of(
                "/v1/boards/" + board + "?day=" + TODAY.plusDays(30),
                "/v1/boards/" + board + "/entries?day=" + TODAY.plusDays(30),
                "/v1/circles/" + circle + "/today?day=" + TODAY.plusDays(30),
                "/v1/things/" + board + "/links")) {
            assertThat(fetch(path, token)).as(path).doesNotContain(secret);
        }
        assertThat(guestPage(owner, circle, board)).as("a guest's page").doesNotContain(secret);
    }

    /** Moves a moment of one entry: how these tests let time pass. */
    protected void moveMoment(String entry, String column, Instant to) {
        jdbc.sql("update board_entries set " + column + " = :at where id = cast(:id as uuid)")
                .param("at", java.sql.Timestamp.from(to))
                .param("id", entry)
                .update();
    }

    protected String glance(String token, String board) throws Exception {
        return JsonPath.read(fetch("/v1/things/" + board, token), "$.glance");
    }
}
