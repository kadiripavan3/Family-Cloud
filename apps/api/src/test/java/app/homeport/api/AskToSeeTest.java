package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** Asking to see something you know exists and can't open: the question, the answer, and who is told what. */
class AskToSeeTest extends TiesTestBase {

    private String pin;

    /** Nora keeps a PIN and shares it with Alex for one look, which he uses. */
    private void theLindsWithAPinAlexHasSeenOnce() throws Exception {
        theLinds();
        vault(nora);
        vault(alex);
        pin = vaultItem(nora, "Bank card PIN");
        vaultShare(nora, pin, alexId, ",\"once\":true");
        send(HttpMethod.POST, "/v1/vault/items/" + pin + "/open", alex, null, 200);
        send(HttpMethod.POST, "/v1/vault/items/" + pin + "/open", alex, null, 403);
        quiet();
    }

    private String ask(String token, String thing, String more, int expected) throws Exception {
        return send(
                HttpMethod.POST,
                "/v1/things/" + thing + "/asks",
                token,
                "{\"clientId\":\"%s\"%s}".formatted(id(), more),
                expected);
    }

    @Test
    void someoneWhoCanSeeAnItemExistsButCantOpenItAsksAndTheOwnerAnswersFromActivity() throws Exception {
        theLindsWithAPinAlexHasSeenOnce();
        Instant midnight = LocalDate.now(ZoneId.of(ZONE))
                .plusDays(1)
                .atStartOfDay(ZoneId.of(ZONE))
                .toInstant();
        assertThat(JsonPath.<Boolean>read(fetch("/v1/things/" + pin + "/ask", alex), "$.canAsk"))
                .isTrue();

        String asked = ask(alex, pin, ",\"until\":\"%s\"".formatted(midnight), 201);

        String askId = JsonPath.read(asked, "$.id");
        assertThat(JsonPath.<String>read(asked, "$.state")).isEqualTo("open");
        assertThat(JsonPath.<Boolean>read(asked, "$.mine")).isTrue();
        // Nora sees it under the Asks chip, with what there is to do; Alex sees no line of his own asking.
        String hers = activity(nora, "filter=asks&zone=" + ZONE);
        assertThat(said(hers, "items")).containsExactly("Alex asks to see Bank card PIN in the Vault | for today only");
        assertThat(JsonPath.<Integer>read(hers, "$.asks")).isEqualTo(1);
        assertThat(JsonPath.<List<String>>read(hers, "$.items[0].buttons[*].label"))
                .containsExactly("Allow", "Not now");
        assertThat(JsonPath.<List<String>>read(hers, "$.items[0].buttons[*].act"))
                .containsExactly("allow_ask", "decline_ask");
        assertThat(JsonPath.<String>read(hers, "$.items[0].buttons[0].askId")).isEqualTo(askId);
        assertThat(JsonPath.<String>read(hers, "$.items[0].buttons[0].thingId")).isEqualTo(pin);
        assertThat(JsonPath.<String>read(hers, "$.items[0].buttons[0].memberId"))
                .isEqualTo(alexId);
        assertThat(JsonPath.<String>read(hers, "$.items[0].buttons[0].until")).isEqualTo(midnight.toString());
        assertThat(lines(alex)).isEmpty();
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle + "/activity/unread", nora), "$.asks"))
                .isEqualTo(1);
        // Her phone is told who asks and where, never what.
        assertThat(pushed()).containsExactly("nora: Alex asks to see something in the Vault | Open Activity to answer");

        // Allowing before her phone has opened it to him is refused: the API can't make his key.
        String refused = send(HttpMethod.PUT, "/v1/asks/" + askId, nora, "{\"allow\":true}", 409);
        assertThat(JsonPath.<String>read(refused, "$.code")).isEqualTo("not_opened_yet");
        // Her phone shares it until midnight, then says so.
        vaultShare(nora, pin, alexId, ",\"stopsAt\":\"%s\"".formatted(midnight));
        String allowed = send(HttpMethod.PUT, "/v1/asks/" + askId, nora, "{\"allow\":true}", 200);

        assertThat(JsonPath.<String>read(allowed, "$.state")).isEqualTo("allowed");
        assertThat(JsonPath.<Integer>read(activity(nora, ""), "$.asks")).isZero();
        assertThat(said(activity(nora, "filter=asks"), "items"))
                .containsExactly("Alex asks to see Bank card PIN in the Vault | You said yes");
        assertThat(JsonPath.<List<String>>read(activity(nora, "filter=asks"), "$.items[0].buttons"))
                .isEmpty();
        assertThat(lines(alex)).contains("Nora said yes: you can open Bank card PIN");
        assertThat(pushed()).contains("alex: Nora said yes | Open it to see what you asked for");
        send(HttpMethod.POST, "/v1/vault/items/" + pin + "/open", alex, null, 200);
        assertThat(JsonPath.<Boolean>read(fetch("/v1/things/" + pin + "/ask", alex), "$.canAsk"))
                .isFalse();
        // Answering twice changes nothing.
        send(HttpMethod.PUT, "/v1/asks/" + askId, nora, "{\"allow\":false}", 200);
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + pin + "/ask", alex), "$.ask.state"))
                .isEqualTo("allowed");
    }

    @Test
    void notNowIsAnAnswerTooAndAskingTwiceIsOneQuestion() throws Exception {
        theLindsWithAPinAlexHasSeenOnce();
        String body = "{\"clientId\":\"%s\",\"once\":true}".formatted(id());
        String first = send(HttpMethod.POST, "/v1/things/" + pin + "/asks", alex, body, 201);
        send(HttpMethod.POST, "/v1/things/" + pin + "/asks", alex, body, 201);
        String again = ask(alex, pin, "", 201);

        assertThat(JsonPath.<String>read(again, "$.id")).isEqualTo(JsonPath.<String>read(first, "$.id"));
        assertThat(said(activity(nora, "filter=asks"), "items"))
                .containsExactly("Alex asks to see Bank card PIN in the Vault | for one look");
        assertThat(pushed()).hasSize(1);

        send(HttpMethod.PUT, "/v1/asks/" + JsonPath.<String>read(first, "$.id"), nora, "{\"allow\":false}", 200);

        assertThat(lines(alex)).containsExactly("Nora said not now to Bank card PIN");
        assertThat(pushed()).contains("alex: Nora said not now | You can ask again another time");
        // He can ask again, and take it back.
        assertThat(JsonPath.<Boolean>read(fetch("/v1/things/" + pin + "/ask", alex), "$.canAsk"))
                .isTrue();
        String second = JsonPath.read(ask(alex, pin, "", 201), "$.id");
        send(HttpMethod.DELETE, "/v1/asks/" + second, alex, null, 204);
        assertThat(JsonPath.<Integer>read(activity(nora, ""), "$.asks")).isZero();
        assertThat(said(activity(nora, "filter=asks"), "items"))
                .contains("Alex asks to see Bank card PIN in the Vault | They took it back");
    }

    @Test
    void onlySomeoneWhoSeesItAndCantOpenItCanAskAndOnlyItsOwnerCanAnswer() throws Exception {
        theLindsWithAPinAlexHasSeenOnce();
        String kai = person("Kai");
        join(nora, circle, kai);
        vault(kai);
        quiet();
        String wifi = vaultItem(nora, "Home Wi-Fi");
        vaultShare(nora, wifi, alexId, "");
        String page = page(nora, circle, "Packing", "circle");

        // Kai was never shown the PIN: for him it isn't there to ask about.
        ask(kai, pin, "", 404);
        send(HttpMethod.GET, "/v1/things/" + pin + "/ask", kai, null, 404);
        // Nora owns it; Alex can open the Wi-Fi; a page is open to whoever sees it; a time has to lie ahead.
        assertThat(JsonPath.<String>read(ask(nora, pin, "", 400), "$.code")).isEqualTo("yours_already");
        assertThat(JsonPath.<String>read(ask(alex, wifi, "", 409), "$.code")).isEqualTo("open_already");
        assertThat(JsonPath.<String>read(ask(alex, page, "", 400), "$.code")).isEqualTo("nothing_to_ask");
        assertThat(JsonPath.<String>read(ask(alex, pin, ",\"until\":\"2020-01-01T00:00:00Z\"", 400), "$.code"))
                .isEqualTo("invalid_time");
        assertThat(JsonPath.<Boolean>read(fetch("/v1/things/" + page + "/ask", alex), "$.canAsk"))
                .isFalse();

        String askId = JsonPath.read(ask(alex, pin, "", 201), "$.id");
        // Nobody but Nora answers, and nobody but Alex takes it back. To Kai the question isn't there.
        send(HttpMethod.PUT, "/v1/asks/" + askId, alex, "{\"allow\":true}", 403);
        send(HttpMethod.PUT, "/v1/asks/" + askId, kai, "{\"allow\":true}", 404);
        send(HttpMethod.DELETE, "/v1/asks/" + askId, kai, null, 404);
        send(HttpMethod.DELETE, "/v1/asks/" + askId, nora, null, 404);
        assertThat(everyLineOf(kai)).allSatisfy(line -> assertThat(line).doesNotContain("PIN"));
        // When the item is taken back from Alex, the question about it is no longer in anyone's Activity but
        // its owner's, and goes with the item when that is deleted.
        send(HttpMethod.DELETE, "/v1/things/" + pin, nora, null, 204);
        assertThat(jdbc.sql("select count(*) from asks").query(Integer.class).single())
                .isZero();
        assertThat(said(activity(nora, "filter=asks"), "items")).isEmpty();
    }

    private List<String> everyLineOf(String token) throws Exception {
        List<String> all = new java.util.ArrayList<>(said(activity(token, ""), "items"));
        all.addAll(said(activity(token, "filter=asks"), "items"));
        return all;
    }
}
