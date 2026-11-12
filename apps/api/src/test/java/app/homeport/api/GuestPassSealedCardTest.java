package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Sealed cards on a guest pass: a door code or a Wi‑Fi password that the pass's maker scrambled on their
 * phone. The API keeps the scrambled text, hands it only to the phone the pass is open on, and forgets a
 * show-once card the moment the guest's page says it was shown. What opens a card is in
 * {@link VaultProtocolTest}; this is what the API does around it.
 */
class GuestPassSealedCardTest extends VaultTestBase {

    private static String card(String label, String ciphertext, boolean once) {
        return "{\"label\":\"%s\",\"ciphertext\":\"%s\",\"once\":%s}".formatted(label, ciphertext, once);
    }

    private String pass(String token, String circle, int expected, String things, String cards) throws Exception {
        return send(
                HttpMethod.POST,
                "/v1/circles/" + circle + "/guest-passes",
                token,
                "{\"clientId\":\"%s\",\"guestName\":\"Ines\",\"endsAt\":\"%s\",\"thingIds\":[%s],\"cards\":[%s]}"
                        .formatted(id(), Instant.now().plusSeconds(3600), things, cards),
                expected);
    }

    private static String path(String pass) {
        return JsonPath.<String>read(pass, "$.url").replaceFirst("^https?://[^/]+", "");
    }

    /**
     * Types the pass's code on a phone, as a browser sends it: a form names the page it came from. Returns the
     * answer, with the cookie that makes this phone the pass's phone.
     */
    private MvcResult enter(String pass) throws Exception {
        return mvc.perform(post(path(pass))
                        .header("Origin", "http://localhost")
                        .param("code", JsonPath.<String>read(pass, "$.code")))
                .andReturn();
    }

    private String page(String pass, Cookie phone) throws Exception {
        var request = get(path(pass));
        if (phone != null) {
            request = request.cookie(phone);
        }
        return mvc.perform(request).andReturn().getResponse().getContentAsString();
    }

    private int shown(String pass, String cardId, Cookie phone) throws Exception {
        var request = post(path(pass) + "/cards/" + cardId + "/shown").header("Origin", "http://localhost");
        if (phone != null) {
            request = request.cookie(phone);
        }
        return mvc.perform(request).andReturn().getResponse().getStatus();
    }

    @Test
    void sealedCardsAreHandedOnlyToThePhoneThePassIsOpenOnForItsOwnScriptToOpen() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String notes = page(nora, circle, "Babysitter notes", "circle");
        String doorCode = sealed(40);
        String wifi = sealed(60);
        String pass = pass(
                nora,
                circle,
                201,
                "\"" + notes + "\"",
                card("Front door code", doorCode, true) + "," + card("Home Wi-Fi", wifi, false));

        // The people in the circle see the cards by their labels, never what they hold.
        assertThat(JsonPath.<List<String>>read(pass, "$.cards[*].label"))
                .containsExactly("Front door code", "Home Wi-Fi");
        assertThat(JsonPath.<List<Boolean>>read(pass, "$.cards[*].once")).containsExactly(true, false);
        assertThat(JsonPath.<List<Boolean>>read(pass, "$.cards[*].shown")).containsExactly(false, false);
        assertThat(pass).doesNotContain(doorCode, wifi);

        // Before the code is typed the page holds nothing of them.
        assertThat(page(pass, null)).doesNotContain(doorCode, wifi, "Front door code");

        MvcResult opened = enter(pass);
        Cookie phone = opened.getResponse().getCookie("homeport_guest");
        String html = opened.getResponse().getContentAsString();
        assertThat(html)
                .contains("Babysitter notes")
                .contains("data-sealed=\"" + doorCode + "\"")
                .contains("data-sealed=\"" + wifi + "\"")
                .contains("data-once=\"true\"")
                .contains("src=\"/share/guest.js\"");
        // Only the API's own script may run on this page, nothing is written into it, and nothing leaves it.
        assertThat(html.split("<script").length).isEqualTo(2);
        assertThat(html).doesNotContain("style=\"").doesNotContain("onclick");
        String policy = opened.getResponse().getHeader("Content-Security-Policy");
        assertThat(policy)
                .contains("default-src 'none'")
                .contains("script-src 'self'")
                .contains("connect-src 'self'")
                .doesNotContain("unsafe-inline")
                .doesNotContain("unsafe-eval")
                .doesNotContain("*");
        assertThat(opened.getResponse().getHeader("Referrer-Policy")).isEqualTo("same-origin");
        assertThat(opened.getResponse().getHeader("Cache-Control")).isEqualTo("no-store");
        // The script and its style sheet are served by the API itself.
        String script =
                mvc.perform(get("/share/guest.js")).andReturn().getResponse().getContentAsString();
        assertThat(script).contains("crypto.subtle.decrypt").contains("AES-GCM").contains("This link is incomplete");
        assertThat(mvc.perform(get("/share/guest.css"))
                        .andReturn()
                        .getResponse()
                        .getStatus())
                .isEqualTo(200);

        // Another phone gets none of it, with or without the code.
        assertThat(page(pass, null)).contains("open on another phone").doesNotContain(doorCode, wifi);
        assertThat(enter(pass).getResponse().getContentAsString()).doesNotContain(doorCode, wifi);
    }

    @Test
    void aShowOnceCardIsForgottenWhenThePassesOwnPhoneSaysItWasShown() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String doorCode = sealed(40);
        String wifi = sealed(60);
        String pass = pass(
                nora, circle, 201, "", card("Front door code", doorCode, true) + "," + card("Home Wi-Fi", wifi, false));
        String id = JsonPath.read(pass, "$.id");
        String door = JsonPath.read(pass, "$.cards[0].id");
        String net = JsonPath.read(pass, "$.cards[1].id");

        // Nobody can say it was shown before the pass is open on a phone, and afterwards only that phone can.
        assertThat(shown(pass, door, null)).isEqualTo(404);
        Cookie phone = enter(pass).getResponse().getCookie("homeport_guest");
        assertThat(shown(pass, door, null)).isEqualTo(404);
        assertThat(shown(pass, door, new Cookie("homeport_guest", "another-phone")))
                .isEqualTo(404);
        assertThat(shown(pass, id(), phone)).isEqualTo(404);
        assertThat(page(pass, phone)).contains(doorCode);

        assertThat(shown(pass, door, phone)).isEqualTo(204);

        // From here on the API has nothing left to hand out, to this phone or to anyone.
        String after = page(pass, phone);
        assertThat(after)
                .doesNotContain(doorCode)
                .contains("Front door code")
                .contains("shown once and is hidden for good")
                .contains(wifi);
        assertThat(jdbc.sql("select count(*) from guest_pass_cards where ciphertext is null")
                        .query(Integer.class)
                        .single())
                .isEqualTo(1);
        // Nora sees that it was opened.
        String noras = fetch("/v1/guest-passes/" + id, nora);
        assertThat(JsonPath.<List<Boolean>>read(noras, "$.cards[*].shown")).containsExactly(true, false);
        assertThat(JsonPath.<String>read(noras, "$.cards[0].shownAt")).isNotNull();

        // A card that isn't show-once is noted as shown and stays.
        assertThat(shown(pass, net, phone)).isEqualTo(204);
        assertThat(shown(pass, net, phone)).isEqualTo(204);
        assertThat(page(pass, phone)).contains(wifi);
        assertThat(JsonPath.<List<Boolean>>read(fetch("/v1/guest-passes/" + id, nora), "$.cards[*].shown"))
                .containsExactly(true, true);

        // When the pass ends, so does everything on it.
        send(HttpMethod.DELETE, "/v1/guest-passes/" + id, nora, null, 204);
        assertThat(page(pass, phone)).contains("This pass has ended").doesNotContain(wifi);
        assertThat(shown(pass, net, phone)).isEqualTo(404);
    }

    @Test
    void cardsCanBeAddedLaterAndTakenOffAndEveryoneOfThemIsBounded() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String mia = person("Mia");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String miaId = join(nora, circle, mia);
        send(HttpMethod.PATCH, "/v1/members/" + miaId, nora, "{\"role\":\"teen\"}", 200);
        String private_ = page(nora, circle, "Gift list", "me");

        // A pass needs something on it: a thing or a card. A card alone is enough.
        pass(nora, circle, 400, "", "");
        String body = "{\"clientId\":\"%s\",\"guestName\":\"Ines\",\"endsAt\":\"%s\",\"thingIds\":[],\"cards\":[%s]}"
                .formatted(id(), Instant.now().plusSeconds(3600), card("Front door code", sealed(40), true));
        String pass = send(HttpMethod.POST, "/v1/circles/" + circle + "/guest-passes", nora, body, 201);
        // Sent twice, the pass and its card are there once.
        String again = send(HttpMethod.POST, "/v1/circles/" + circle + "/guest-passes", nora, body, 201);
        assertThat(JsonPath.<String>read(again, "$.id")).isEqualTo(JsonPath.<String>read(pass, "$.id"));
        assertThat(JsonPath.<Integer>read(again, "$.cards.length()")).isEqualTo(1);
        String id = JsonPath.read(pass, "$.id");
        String cards = "/v1/guest-passes/" + id + "/cards";

        // Added later, by another adult of the circle; sent twice, added once.
        String more =
                "{\"clientId\":\"%s\",\"label\":\" Home Wi-Fi \",\"ciphertext\":\"%s\"}".formatted(id(), sealed(60));
        String added = send(HttpMethod.POST, cards, alex, more, 201);
        send(HttpMethod.POST, cards, alex, more, 201);
        assertThat(JsonPath.<List<String>>read(added, "$.cards[*].label"))
                .containsExactly("Front door code", "Home Wi-Fi");
        assertThat(JsonPath.<Integer>read(fetch("/v1/guest-passes/" + id, nora), "$.cards.length()"))
                .isEqualTo(2);

        // What isn't a card: no name, a name too long, text that isn't scrambled, too much of it, a thing its maker
        // can't see.
        String card = "{\"clientId\":\"%s\",\"label\":\"%s\",\"ciphertext\":\"%s\"%s}";
        send(HttpMethod.POST, cards, nora, card.formatted(id(), " ", sealed(40), ""), 400);
        send(HttpMethod.POST, cards, nora, card.formatted(id(), "x".repeat(61), sealed(40), ""), 400);
        assertThat(code(send(HttpMethod.POST, cards, nora, card.formatted(id(), "Door", "4821 then star", ""), 400)))
                .isEqualTo("not_sealed");
        assertThat(code(send(HttpMethod.POST, cards, nora, card.formatted(id(), "Door", sealed(3100), ""), 413)))
                .isEqualTo("too_large");
        assertThat(code(send(
                        HttpMethod.POST,
                        cards,
                        alex,
                        card.formatted(id(), "Door", sealed(40), ",\"thingId\":\"" + private_ + "\""),
                        400)))
                .isEqualTo("invalid_things");
        assertThat(code(send(
                        HttpMethod.POST,
                        "/v1/circles/" + circle + "/guest-passes",
                        nora,
                        "{\"clientId\":\"%s\",\"guestName\":\"Ines\",\"endsAt\":\"%s\",\"thingIds\":[],\"cards\":[{\"label\":\"Door\",\"ciphertext\":\"the code is 4821\"}]}"
                                .formatted(id(), Instant.now().plusSeconds(3600)),
                        400)))
                .isEqualTo("not_sealed");
        // Only the adults of the circle, as for the pass itself.
        send(HttpMethod.POST, cards, mia, card.formatted(id(), "Door", sealed(40), ""), 403);
        send(HttpMethod.DELETE, cards + "/" + JsonPath.<String>read(pass, "$.cards[0].id"), mia, null, 403);

        // Ten at most.
        for (int i = 3; i <= 10; i++) {
            send(HttpMethod.POST, cards, nora, card.formatted(id(), "Card " + i, sealed(40), ""), 201);
        }
        assertThat(code(send(HttpMethod.POST, cards, nora, card.formatted(id(), "Card 11", sealed(40), ""), 400)))
                .isEqualTo("too_many_cards");
        assertThat(JsonPath.<Integer>read(fetch("/v1/guest-passes/" + id, nora), "$.cards.length()"))
                .isEqualTo(10);

        // Taken off, it is gone from the guest's page too.
        Cookie phone = enter(pass).getResponse().getCookie("homeport_guest");
        assertThat(page(pass, phone)).contains("Card 10");
        String tenth = JsonPath.read(fetch("/v1/guest-passes/" + id, nora), "$.cards[9].id");
        send(HttpMethod.DELETE, cards + "/" + tenth, nora, null, 204);
        assertThat(page(pass, phone)).doesNotContain("Card 10").contains("Card 9");

        // Nothing is added to a pass that has ended.
        send(HttpMethod.DELETE, "/v1/guest-passes/" + id, nora, null, 204);
        assertThat(code(send(HttpMethod.POST, cards, nora, card.formatted(id(), "Late", sealed(40), ""), 409)))
                .isEqualTo("pass_ended");
    }

    @Test
    void aVaultItemOnAPassShowsItsTitleAndNothingFromInsideUnlessASealedCardCarriesIt() throws Exception {
        String nora = person("Nora");
        vault(nora);
        String circle = circle(nora, "family", "The Linds");
        String inside = sealed(200);
        String door = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/vault/items",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Front door code\",\"category\":\"code\",\"ciphertext\":\"%s\",\"wrappedKey\":\"%s\"}"
                                .formatted(id(), circle, inside, sealed(105)),
                        201),
                "$.id");
        String wifi = item(nora, circle, "Home Wi-Fi", "wifi");

        // On a pass by itself, a Vault item is a title and a line that says where it is kept.
        String plain = pass(nora, circle, 201, "\"" + door + "\"", "");
        String shown = enter(plain).getResponse().getContentAsString();
        assertThat(shown)
                .contains("Front door code")
                .contains("Kept in the Vault. Not shown on a pass.")
                .doesNotContain(inside)
                .doesNotContain("data-sealed");

        // With a sealed card made from it, the card stands for the item: it isn't listed a second time.
        String carried = sealed(40);
        String pass = pass(
                nora,
                circle,
                201,
                "\"" + door + "\",\"" + wifi + "\"",
                "{\"label\":\"Front door code\",\"ciphertext\":\"%s\",\"once\":true,\"thingId\":\"%s\"}"
                        .formatted(carried, door));
        assertThat(JsonPath.<String>read(pass, "$.cards[0].thingId")).isEqualTo(door);
        String html = enter(pass).getResponse().getContentAsString();
        assertThat(html.split("Front door code", -1).length - 1).isEqualTo(1);
        assertThat(html)
                .contains("data-sealed=\"" + carried + "\"")
                .contains("Home Wi-Fi")
                .contains("Not shown on a pass.");
        assertThat(html).doesNotContain(inside);
    }
}
