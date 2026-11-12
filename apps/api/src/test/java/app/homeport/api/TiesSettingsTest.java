package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.export.ExportService;
import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.TestPropertySource;

/**
 * Two things that depend on how the API is set up: an export that hits its bound says what was left out, and
 * "Journey too" is left to Journey where this API may not remove the sign-in the two apps share.
 */
@TestPropertySource(properties = {"homeport.export.max-bytes=1", "homeport.accounts.remove-sign-in=false"})
class TiesSettingsTest extends TiesTestBase {

    @Autowired
    ExportService exports;

    @Test
    void anExportThatHitsItsBoundSaysWhatWasLeftOut() throws Exception {
        theLinds();
        photos(nora, "me", 2);
        page(nora, circle, "Packing", "me");
        String id = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/circles/" + circle + "/exports",
                        nora,
                        "{\"clientId\":\"%s\",\"scope\":\"mine\"}".formatted(id()),
                        201),
                "$.id");

        exports.makeWaiting();

        String ready = fetch("/v1/exports/" + id, nora);
        assertThat(JsonPath.<String>read(ready, "$.state")).isEqualTo("ready");
        assertThat(JsonPath.<List<String>>read(ready, "$.leftOut"))
                .hasSize(1)
                .first()
                .asString()
                .startsWith("2 photos, videos or files are not in it: one export holds");
        // The page is in it all the same: README, the page as text and as a web page.
        assertThat(JsonPath.<Integer>read(ready, "$.files")).isEqualTo(3);
    }

    @Test
    void journeyTooIsLeftToJourneyWhereThisApiMayNotRemoveTheSharedSignIn() throws Exception {
        theLinds();

        String answer = send(HttpMethod.DELETE, "/v1/me?journeyToo=true", alex, null, 200);

        assertThat(JsonPath.<String>read(answer, "$.signIn")).isEqualTo("left_to_journey");
        assertThat(JsonPath.<String>read(answer, "$.message")).contains("use Delete account in Journey");
        // His Homeport account is gone; his sign-in is not, and nothing will try to remove it later.
        send(HttpMethod.GET, "/v1/me", alex, null, 401);
        assertThat(jdbc.sql("select count(*) from local_users where email = 'alex@example.com'")
                        .query(Integer.class)
                        .single())
                .isEqualTo(1);
        assertThat(jdbc.sql("select count(*) from deleted_accounts where sign_in_removed_at is null")
                        .query(Integer.class)
                        .single())
                .isZero();
    }
}
