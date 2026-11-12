package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Small things the screens needed and had to work around: the words of a scan to start "change the words"
 * with, a year on a reminder that isn't due this year, a goal's unit in the list of goals, taking your own
 * answer to an event back, and a jot that files an event where its reading said it would be.
 */
class SmallGapsTest extends PlanTestBase {

    @Test
    void aDocumentHandsBackTheWordsReadFromItsScan() throws Exception {
        theLinds();
        String words = "Home insurance policy\nPolicy number: HL-204-118\nThe policy renews on 1 February 2027.";
        String scan = uploadPhoto(nora);
        String blank = uploadPhoto(nora);
        List<String> ids = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/library",
                        nora,
                        "{\"circleId\":\"%s\",\"items\":[{\"clientId\":\"%s\",\"mediaId\":\"%s\",\"kind\":\"document\",\"title\":\"Home insurance\",\"text\":%s},{\"clientId\":\"%s\",\"mediaId\":\"%s\",\"kind\":\"document\",\"title\":\"A drawing\"}]}"
                                .formatted(
                                        circle,
                                        id(),
                                        scan,
                                        new tools.jackson.databind.json.JsonMapper().writeValueAsString(words),
                                        id(),
                                        blank),
                        201),
                "$.items[*].item.id");

        String read = fetch("/v1/documents/" + ids.get(0) + "?day=" + TODAY, nora);
        assertThat(JsonPath.<String>read(read, "$.text")).isEqualTo(words);
        assertThat(JsonPath.<Boolean>read(read, "$.hasText")).isTrue();
        // Nothing was read from the drawing: the words are empty, not missing.
        String drawing = fetch("/v1/documents/" + ids.get(1) + "?day=" + TODAY, nora);
        assertThat(JsonPath.<String>read(drawing, "$.text")).isEmpty();
        assertThat(JsonPath.<Boolean>read(drawing, "$.hasText")).isFalse();

        // Changed words come back as they were sent, and only to someone who may see the document.
        String changed = send(
                HttpMethod.PATCH,
                "/v1/documents/" + ids.get(0) + "?day=" + TODAY,
                nora,
                "{\"text\":\"Home insurance policy, renewed\"}",
                200);
        assertThat(JsonPath.<String>read(changed, "$.text")).isEqualTo("Home insurance policy, renewed");
        send(HttpMethod.GET, "/v1/documents/" + ids.get(0), alex, null, 404);
    }

    @Test
    void aRemindersGlanceSaysTheYearWhenItIsNotThisYear() throws Exception {
        theLinds();
        // Counted from the real day: a glance has no "day on the phone" to go by.
        LocalDate today = LocalDate.now(ZoneId.of(ZONE));
        LocalDate nextYear = LocalDate.of(today.getYear() + 1, 1, 2).plusDays(today.getDayOfYear() > 358 ? 30 : 0);
        LocalDate thisYear = today.getDayOfYear() > 300 ? today.minusDays(40) : today.plusDays(40);
        String renew = reminder(nora, "Renew Mia's passport", ",\"dueOn\":\"%s\"".formatted(nextYear));
        String later = reminder(nora, "Order the photo book", ",\"dueOn\":\"%s\"".formatted(thisYear));
        String soon = reminder(nora, "Water the plants", ",\"dueOn\":\"%s\"".formatted(today.plusDays(1)));

        assertThat(JsonPath.<String>read(fetch("/v1/things/" + renew, nora), "$.glance"))
                .isEqualTo(DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH)
                        .format(nextYear));
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + later, nora), "$.glance"))
                .isEqualTo(DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH).format(thisYear));
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + soon, nora), "$.glance"))
                .isEqualTo("Tomorrow");
    }

    @Test
    void aGoalInTheListSaysWhatItCounts() throws Exception {
        theLinds();
        goal(nora, "Norway 2027", ",\"unit\":\"money\",\"target\":800000,\"audience\":\"circle\"");
        goal(nora, "Mia's skates fund", ",\"target\":50,\"unitWords\":\"stars\",\"audience\":\"circle\"");

        String list = fetch("/v1/circles/" + circle + "/goals?day=" + TODAY, alex);
        assertThat(JsonPath.<List<String>>read(list, "$[*].title")).containsExactly("Norway 2027", "Mia's skates fund");
        assertThat(JsonPath.<List<String>>read(list, "$[*].unit")).containsExactly("money", "count");
        assertThat(JsonPath.<List<String>>read(list, "$[*].unitWords")).containsExactly("", "stars");
    }

    @Test
    void someoneCanTakeTheirOwnAnswerToAnEventBack() throws Exception {
        theLinds();
        String stranger = person("Stranger");
        String party = event(
                nora,
                "Mia's party",
                "2026-12-05",
                "14:00",
                ",\"audience\":\"circle\",\"guests\":[{\"memberId\":\"%s\",\"part\":\"brings the cake\"},{\"memberId\":\"%s\"}]"
                        .formatted(alexId, leoId));
        share(nora, party, "{\"audience\":\"circle\",\"everyoneEdits\":false}");

        String going = send(HttpMethod.PUT, "/v1/events/" + party + "/answer", alex, "{\"answer\":\"going\"}", 200);
        assertThat(JsonPath.<String>read(going, "$.myAnswer")).isEqualTo("going");
        assertThat(JsonPath.<Integer>read(going, "$.unanswered")).isEqualTo(1);

        // He takes it back, though he may only look at the event: no answer again, still on it, his part kept.
        String back = send(HttpMethod.DELETE, "/v1/events/" + party + "/answer", alex, null, 200);
        assertThat(JsonPath.<Object>read(back, "$.myAnswer")).isNull();
        assertThat(JsonPath.<Integer>read(back, "$.unanswered")).isEqualTo(2);
        assertThat(JsonPath.<List<String>>read(back, "$.guests[*].name")).containsExactly("Alex", "Leo");
        assertThat(JsonPath.<List<String>>read(back, "$.guests[?(@.name == 'Alex')].part"))
                .containsExactly("brings the cake");
        // Taking back what isn't there is fine, and so is doing it when you were never on the event.
        send(HttpMethod.DELETE, "/v1/events/" + party + "/answer", alex, null, 200);
        String noras = send(HttpMethod.DELETE, "/v1/events/" + party + "/answer", nora, null, 200);
        assertThat(JsonPath.<List<String>>read(noras, "$.guests[*].name")).containsExactly("Alex", "Leo");
        // Only your own answer: Leo's stays, and to a stranger the event isn't there.
        String leosRow = JsonPath.<List<String>>read(back, "$.guests[?(@.name == 'Leo')].id")
                .get(0);
        send(HttpMethod.PATCH, "/v1/event-guests/" + leosRow, nora, "{\"answer\":\"going\"}", 200);
        send(HttpMethod.DELETE, "/v1/events/" + party + "/answer", alex, null, 200);
        assertThat(JsonPath.<Integer>read(fetch("/v1/events/" + party, nora), "$.going"))
                .isEqualTo(1);
        send(HttpMethod.DELETE, "/v1/events/" + party + "/answer", stranger, null, 404);
    }

    @Test
    void aJotThatSuggestsAPlaceFilesTheEventThere() throws Exception {
        theLinds();
        event(nora, "Haircut · Leo", "2026-10-03", "10:00", ",\"audience\":\"circle\",\"place\":\"Barber Miha\"");
        String line = "{\"clientId\":\"%s\",\"text\":\"%s\",\"day\":\"%s\",\"timeZone\":\"%s\"}";

        // The reading says where the last haircut was, and the jot is filed as it was read.
        String reading = send(
                HttpMethod.POST,
                "/v1/circles/" + circle + "/read",
                nora,
                "{\"text\":\"Haircut for Leo Saturday at 10\",\"day\":\"%s\",\"timeZone\":\"%s\"}"
                        .formatted(TODAY, ZONE),
                200);
        assertThat(JsonPath.<String>read(reading, "$.items[0].place.words")).isEqualTo("Barber Miha");
        String jotted = send(
                HttpMethod.POST,
                "/v1/circles/" + circle + "/jots",
                nora,
                line.formatted(id(), "Haircut for Leo Saturday at 10", TODAY, ZONE),
                201);
        String haircut = fetch("/v1/events/" + JsonPath.<String>read(jotted, "$[0].thingId"), nora);
        assertThat(JsonPath.<String>read(haircut, "$.title")).isEqualTo("Haircut · Leo");
        assertThat(JsonPath.<String>read(haircut, "$.day")).isEqualTo("2026-11-14");
        assertThat(JsonPath.<String>read(haircut, "$.place")).isEqualTo("Barber Miha");

        // Nothing like it before: no place is made up.
        String first = send(
                HttpMethod.POST,
                "/v1/circles/" + circle + "/jots",
                nora,
                line.formatted(id(), "Dentist for Mia Friday at 9", TODAY, ZONE),
                201);
        assertThat(JsonPath.<String>read(
                        fetch("/v1/events/" + JsonPath.<String>read(first, "$[0].thingId"), nora), "$.place"))
                .isEmpty();
        // Where Nora's own events were is not suggested to Alex: he may not see them.
        event(nora, "Massage", "2026-10-20", "18:00", ",\"audience\":\"me\",\"place\":\"Studio Lotus\"");
        String his = send(
                HttpMethod.POST,
                "/v1/circles/" + circle + "/jots",
                alex,
                line.formatted(id(), "Massage Monday at 6", TODAY, ZONE),
                201);
        assertThat(JsonPath.<String>read(
                        fetch("/v1/events/" + JsonPath.<String>read(his, "$[0].thingId"), alex), "$.place"))
                .isEmpty();
    }

    @Test
    void anEventThatLastsDaysSaysThemAllWhereverItIsListed() throws Exception {
        theLinds();
        int year = LocalDate.now(ZoneId.of(ZONE)).getYear();
        String trip = event(nora, "Norway", (year + 1) + "-04-03", null, ",\"endDay\":\"" + (year + 1) + "-04-17\"");
        String camp = event(nora, "Camp", (year + 1) + "-03-28", null, ",\"endDay\":\"" + (year + 1) + "-04-04\"");

        assertThat(JsonPath.<String>read(fetch("/v1/things/" + trip, nora), "$.glance"))
                .isEqualTo("3 to 17 April " + (year + 1));
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + camp, nora), "$.glance"))
                .isEqualTo("28 March to 4 April " + (year + 1));
    }
}
