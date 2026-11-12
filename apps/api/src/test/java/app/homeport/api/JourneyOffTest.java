package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.TestPropertySource;

/**
 * Homeport without Journey ({@code homeport.journey.mode=off}): every Journey part is absent, nothing fails
 * for the lack of it, and what never needed Journey still works.
 */
@TestPropertySource(properties = "homeport.journey.mode=off")
class JourneyOffTest extends LibraryApiTest {

    @Test
    void withoutJourneyNothingOfItIsOfferedAndNothingElseIsInTheWay() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);

        // The switch says there is no other app here; there are no journeys to keep.
        String mine = fetch("/v1/journey/me", nora);
        assertThat(JsonPath.<String>read(mine, "$.mode")).isEqualTo("off");
        assertThat(JsonPath.<Boolean>read(mine, "$.available")).isFalse();
        assertThat(JsonPath.<Object>read(mine, "$.journey")).isNull();
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/journey/journeys", nora), "$.items"))
                .isEmpty();
        assertThat(status("/v1/journey/journeys/" + UUID.randomUUID() + "/keep-options?circleId=" + circle, nora))
                .isEqualTo(404);
        send(
                HttpMethod.POST,
                "/v1/journey/keeps",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"journeyId\":\"%s\"}"
                        .formatted(id(), circle, UUID.randomUUID()),
                404);

        // Today opens as ever, with nobody away.
        String today = fetch("/v1/circles/" + circle + "/today", nora);
        assertThat(JsonPath.<List<String>>read(today, "$.cards[*].look")).doesNotContain("journey_away");
        String home = fetch("/v1/circles/" + circle + "/journey/at-home", nora);
        assertThat(JsonPath.<Boolean>read(home, "$.available")).isFalse();
        assertThat(JsonPath.<List<Object>>read(home, "$.away")).isEmpty();

        // A goal that names a challenge shows what was put in by hand.
        String goal = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/goals",
                        nora,
                        ("{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Family 10K\",\"target\":30,\"current\":12,"
                                        + "\"source\":{\"kind\":\"journey\",\"ref\":\"family-10k\",\"words\":\"Family 10K in Journey\"}}")
                                .formatted(id(), circle),
                        201),
                "$.id");
        String read = fetch("/v1/goals/" + goal, nora);
        assertThat(JsonPath.<Integer>read(read, "$.current")).isEqualTo(12);
        assertThat(JsonPath.<Boolean>read(read, "$.source.live")).isFalse();

        // There is nowhere to tell a journey, so none is drafted.
        String photo = photo(nora, circle, "2026-11-07T11:42:00+01:00", "");
        String refused = send(
                HttpMethod.POST,
                "/v1/journey/drafts",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"momentOf\":\"%s\"}".formatted(id(), circle, photo),
                404);
        assertThat(JsonPath.<String>read(refused, "$.code")).isEqualTo("journey_off");
        assertThat(JsonPath.<String>read(refused, "$.detail")).isEqualTo("Journey isn't connected here.");

        // A trip is still a trip: planned here, with a note about why it can't become a journey.
        String folder = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/folders",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Norway 2027\"}".formatted(id(), circle),
                        201),
                "$.id");
        String trip = send(
                HttpMethod.PUT,
                "/v1/trips/" + folder,
                nora,
                "{\"startsOn\":\"2027-04-03\",\"endsOn\":\"2027-04-17\"}",
                200);
        assertThat(JsonPath.<Boolean>read(trip, "$.becomes.canBecome")).isFalse();
        assertThat(JsonPath.<String>read(trip, "$.becomes.note")).isEqualTo("Journey isn't connected here.");
        send(HttpMethod.POST, "/v1/trips/" + folder + "/journey", nora, "{\"clientId\":\"%s\"}".formatted(id()), 404);

        // A goodnight never needed Journey's server: it is sent here, and waits at home.
        String clip = sendFile(alex, "video", "video/mp4", "goodnight".getBytes(), ",\"durationSeconds\":20");
        String night = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/goodnights",
                        alex,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"mediaId\":\"%s\",\"forDay\":\"2026-11-11\"}"
                                .formatted(id(), circle, clip),
                        201),
                "$.id");
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/today?day=2026-11-11", nora),
                        "$.cards[?(@.look == 'goodnight')].thingId"))
                .containsExactly(night);
    }
}
