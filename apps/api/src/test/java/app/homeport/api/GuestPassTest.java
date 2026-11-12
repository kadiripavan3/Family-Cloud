package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.MvcResult;

/** Guest passes: chosen things for someone outside the circle, for a set time, on one phone, with no account. */
class GuestPassTest extends ApiTest {

    private String pass(String token, String circle, Instant endsAt, int expected, String... things) throws Exception {
        return send(
                HttpMethod.POST,
                "/v1/circles/" + circle + "/guest-passes",
                token,
                "{\"clientId\":\"%s\",\"guestName\":\"Ines, the sitter\",\"endsAt\":\"%s\",\"thingIds\":[%s]}"
                        .formatted(id(), endsAt, things.length == 0 ? "" : "\"" + String.join("\",\"", things) + "\""),
                expected);
    }

    private static String path(String pass) {
        return JsonPath.<String>read(pass, "$.url").replaceFirst("^https?://[^/]+", "");
    }

    private String page(String path, Cookie cookie) throws Exception {
        var request = get(path);
        if (cookie != null) {
            request = request.cookie(cookie);
        }
        return mvc.perform(request).andReturn().getResponse().getContentAsString();
    }

    @Test
    void theGuestOpensItWithTheCodeOnOnePhoneAndSeesOnlyWhatWasChosen() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String notes = page(nora, circle, "Babysitter notes", "circle");
        String secret = page(nora, circle, "Gift list", "me");
        String pass = pass(nora, circle, Instant.now().plusSeconds(3600), 201, notes);
        String path = path(pass);
        String code = JsonPath.read(pass, "$.code");

        // Without the code: a question, and nothing of the page.
        assertThat(page(path, null))
                .contains("Hello, Ines, the sitter")
                .contains("The Linds")
                .doesNotContain("Words about");

        // A wrong code says so and shows nothing.
        String wrong = mvc.perform(post(path).param("code", code.equals("0000") ? "1111" : "0000"))
                .andReturn()
                .getResponse()
                .getContentAsString();
        assertThat(wrong).contains("That isn't the code").doesNotContain("Words about");

        // The right code opens it, on this phone.
        MvcResult opened = mvc.perform(post(path).param("code", code)).andReturn();
        Cookie phone = opened.getResponse().getCookie("homeport_guest");
        assertThat(opened.getResponse().getContentAsString())
                .contains("Babysitter notes")
                .contains("Words about Babysitter notes")
                .doesNotContain("Gift list");
        assertThat(opened.getResponse().getHeader("Cache-Control")).isEqualTo("no-store");
        assertThat(phone).isNotNull();
        assertThat(phone.isHttpOnly()).isTrue();
        assertThat(page(path, phone)).contains("Words about Babysitter notes");

        // Another phone, even with the code, gets nothing.
        assertThat(page(path, null)).contains("open on another phone").doesNotContain("Words about");
        assertThat(mvc.perform(post(path).param("code", code))
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .contains("open on another phone");
        assertThat(JsonPath.<Boolean>read(
                        fetch("/v1/guest-passes/" + JsonPath.<String>read(pass, "$.id"), nora), "$.opened"))
                .isTrue();
        assertThat(secret).isNotEmpty();
    }

    @Test
    void itStopsWhenItsTimeIsOverOrWhenItIsEnded() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String notes = page(nora, circle, "Babysitter notes", "circle");
        String pass = pass(nora, circle, Instant.now().plusSeconds(3600), 201, notes);
        String id = JsonPath.read(pass, "$.id");
        MvcResult opened = mvc.perform(post(path(pass)).param("code", JsonPath.<String>read(pass, "$.code")))
                .andReturn();
        Cookie phone = opened.getResponse().getCookie("homeport_guest");

        jdbc.sql("update guest_passes set ends_at = now() - interval '1 minute', starts_at = now() - interval '1 hour'")
                .update();
        assertThat(page(path(pass), phone)).contains("This pass has ended").doesNotContain("Words about");
        assertThat(JsonPath.<Boolean>read(fetch("/v1/guest-passes/" + id, nora), "$.running"))
                .isFalse();

        String second = pass(nora, circle, Instant.now().plusSeconds(3600), 201, notes);
        send(HttpMethod.DELETE, "/v1/guest-passes/" + JsonPath.<String>read(second, "$.id"), nora, null, 204);
        assertThat(page(path(second), null)).contains("This pass has ended");
        assertThat(page("/g/not-a-real-pass", null)).contains("isn't there");
    }

    @Test
    void fiveWrongCodesLockIt() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String pass = pass(nora, circle, Instant.now().plusSeconds(3600), 201, page(nora, circle, "Notes", "circle"));
        String code = JsonPath.read(pass, "$.code");
        String wrong = code.equals("0000") ? "1111" : "0000";

        for (int i = 0; i < 5; i++) {
            mvc.perform(post(path(pass)).param("code", wrong));
        }

        assertThat(mvc.perform(post(path(pass)).param("code", code))
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .contains("Too many wrong codes")
                .doesNotContain("Words about");
    }

    @Test
    void onlyTheAdultsGiveOneAndOnlyForWhatTheyCanSeeInThatCircle() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String mia = person("Mia");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String miaId = join(nora, circle, mia);
        send(HttpMethod.PATCH, "/v1/members/" + miaId, nora, "{\"role\":\"teen\"}", 200);
        String shared = page(nora, circle, "Babysitter notes", "circle");
        String private_ = page(nora, circle, "Gift list", "me");
        String elsewhere = page(nora, circle(nora, "crew", "Lisbon crew"), "Plans", "circle");
        Instant tonight = Instant.now().plusSeconds(3600);

        pass(mia, circle, tonight, 403, shared);
        pass(alex, circle, tonight, 400, private_); // Alex can't see it, so he can't hand it out
        pass(nora, circle, tonight, 400, elsewhere);
        pass(nora, circle, tonight, 400);
        pass(nora, circle, Instant.now().minusSeconds(60), 400, shared);
        pass(nora, circle, Instant.now().plusSeconds(40L * 24 * 3600), 400, shared);
        String ok = pass(alex, circle, tonight, 201, shared);

        // A pass is seen by the adults of the circle, not by the teen.
        assertThat(fetch("/v1/circles/" + circle + "/guest-passes", nora)).contains(JsonPath.<String>read(ok, "$.id"));
        send(HttpMethod.GET, "/v1/circles/" + circle + "/guest-passes", mia, null, 403);
        send(HttpMethod.GET, "/v1/guest-passes/" + JsonPath.<String>read(ok, "$.id"), mia, null, 403);
    }
}
