package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.journey.JourneyStatus;
import app.homeport.api.journey.JourneyVisibility;
import app.homeport.api.journey.LocalJourney.Doc;
import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * "What they must never share": the table in docs/04-journey-link.md, one test for each of its rows. Each
 * looks at what the stand-in for Journey holds afterwards: that is everything Journey was ever handed.
 */
class NeverSharedWithJourneyTest extends JourneyApiTest {

    private String nora;
    private String alex;
    private String circle;

    private void theLinds() throws Exception {
        nora = person("Nora");
        alex = person("Alex");
        circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        onJourney(nora, "nora");
        onJourney(alex, "alex");
    }

    private int journeysInJourney() {
        return jdbc.sql("select count(*) from local_journeys")
                .query(Integer.class)
                .single();
    }

    private String everythingJourneyHolds() {
        return String.join(
                "\n",
                jdbc.sql("select doc::text from local_journeys")
                        .query(String.class)
                        .list());
    }

    /** Row 1: nothing private goes to Journey without the "Before it leaves home" screen. */
    @Test
    void nothingPrivateGoesToJourneyWithoutTheCheckBeforeItLeavesHome() throws Exception {
        theLinds();
        String mia = addMember(nora, circle, "Mia", "child");
        String lake = ",\"lat\":46.3625,\"lng\":14.0938,\"placeName\":\"Lake Bled\"";
        String hers = photo(nora, circle, "2026-11-07T11:00:00+01:00", lake);
        String ofMia = photo(nora, circle, "2026-11-07T11:10:00+01:00", lake + ",\"about\":[\"" + mia + "\"]");

        // Everything up to the last step leaves nothing in Journey: drafting, looking at the check, changing it.
        String draft = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/journey/drafts",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"momentOf\":\"%s\"}".formatted(id(), circle, hers),
                        201),
                "$.id");
        fetch("/v1/journey/drafts/" + draft, nora);
        fetch("/v1/journey/drafts/" + draft + "/check", nora);
        send(HttpMethod.PATCH, "/v1/journey/drafts/" + draft, nora, "{\"title\":\"The lake\"}", 200);
        send(HttpMethod.PUT, "/v1/journey/drafts/" + draft + "/check", nora, "{\"visibility\":\"public\"}", 200);
        // Keeping, the switch between the apps, Today and the rest only ever read from Journey.
        fetch("/v1/journey/me", nora);
        fetch("/v1/journey/journeys", nora);
        fetch("/v1/circles/" + circle + "/journey/at-home", nora);
        fetch("/v1/circles/" + circle + "/today", nora);
        fetch("/v1/journey/circles", nora);
        assertThat(journeysInJourney()).as("nothing has left home").isZero();

        // The one step that sends: what the check lets through. Mia's photo was left out by it, and stays.
        String job = finished(
                nora,
                send(
                        HttpMethod.POST,
                        "/v1/journey/drafts/" + draft + "/post",
                        nora,
                        "{\"clientId\":\"%s\"}".formatted(id()),
                        201));
        assertThat(JsonPath.<String>read(job, "$.status")).isEqualTo("done");
        assertThat(JsonPath.<Integer>read(job, "$.total")).isEqualTo(1);
        assertThat(journeysInJourney()).isEqualTo(1);
        UUID told = UUID.fromString(JsonPath.read(fetch("/v1/journey/drafts/" + draft, nora), "$.journeyId"));
        Doc doc = journey.doc(told).orElseThrow();
        assertThat(doc.entries()).hasSize(1);
        assertThat(doc.entries().get(0).shots()).hasSize(1);
        // The exact spot stayed too: Journey has the town and a point rounded to about a kilometre.
        assertThat(everythingJourneyHolds())
                .contains("Lake Bled")
                .doesNotContain("46.3625")
                .doesNotContain("14.0938");
        assertThat(JsonPath.<List<Boolean>>read(
                        fetch("/v1/journey/drafts/" + draft + "/check", nora),
                        "$.items[?(@.itemId == '" + ofMia + "')].goes"))
                .containsExactly(false);
    }

    /** Row 2: Journey never learns what is in a circle, only that it exists and who is in it. */
    @Test
    void journeyNeverLearnsWhatIsInACircle() throws Exception {
        theLinds();
        String mia = addMember(nora, circle, "Mia", "child");
        page(nora, circle, "Wi-Fi and smart home", "circle");
        photo(nora, circle, "2026-11-07T11:00:00+01:00", ",\"audience\":\"circle\",\"about\":[\"" + mia + "\"]");
        send(
                HttpMethod.POST,
                "/v1/bills",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Electricity\",\"amountCents\":8420,\"dueOn\":\"2026-11-12\"}"
                        .formatted(id(), circle),
                201);

        // What Journey may ask about a circle: its name, its kind, who signs in, and when a goodnight is welcome.
        String circles = fetch("/v1/journey/circles", nora);
        assertThat(JsonPath.<Map<String, Object>>read(circles, "$[0]").keySet())
                .containsExactlyInAnyOrder("id", "name", "kind", "people", "goodnightAt", "timeZone");
        assertThat(circles)
                .doesNotContain("Wi-Fi")
                .doesNotContain("Electricity")
                .doesNotContain("Mia");

        // A trip planned in the circle becomes a journey: its title and its dates go, and who writes in it. The
        // plan, the packing list, the budget and the places the plan names stay.
        String trips = JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/notes", nora), "$.spaces[?(@.title == 'Trips')].id")
                .get(0);
        String folder = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/folders",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Norway 2027\",\"parentId\":\"%s\"}"
                                .formatted(id(), circle, trips),
                        201),
                "$.id");
        String plan = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/pages",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Day by day\",\"body\":\"The cabin key is under the third stone.\",\"folderId\":\"%s\"}"
                                .formatted(id(), circle, folder),
                        201),
                "$.id");
        send(
                HttpMethod.POST,
                "/v1/pages/" + plan + "/blocks",
                nora,
                "{\"clientId\":\"%s\",\"kind\":\"place\",\"text\":\"Storgata 12, Tromsø\",\"lat\":69.6492,\"lng\":18.9553}"
                        .formatted(id()),
                201);
        send(
                HttpMethod.PUT,
                "/v1/trips/" + folder,
                nora,
                "{\"startsOn\":\"2027-04-03\",\"endsOn\":\"2027-04-17\"}",
                200);
        send(HttpMethod.POST, "/v1/trips/" + folder + "/journey", nora, "{\"clientId\":\"%s\"}".formatted(id()), 201);

        String held = everythingJourneyHolds();
        assertThat(held).contains("Norway 2027").contains("2027-04-03");
        assertThat(held)
                .doesNotContain("Storgata")
                .doesNotContain("69.64")
                .doesNotContain("third stone")
                .doesNotContain("Day by day")
                .doesNotContain("The Linds")
                .doesNotContain(circle)
                .doesNotContain("Mia");
        Doc doc = journey.doc(UUID.fromString(JsonPath.read(fetch("/v1/trips/" + folder, nora), "$.journey.journeyId")))
                .orElseThrow();
        assertThat(doc.entries()).isEmpty();
        assertThat(doc.authors()).containsExactly(userId(alex));

        // A heart given at home, and a goodnight, are the circle's: Journey holds neither.
        String clip = sendFile(alex, "video", "video/mp4", "goodnight".getBytes(), ",\"durationSeconds\":8");
        send(
                HttpMethod.POST,
                "/v1/goodnights",
                alex,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"mediaId\":\"%s\",\"title\":\"Sleep well, Mia\"}"
                        .formatted(id(), circle, clip),
                201);
        assertThat(everythingJourneyHolds()).doesNotContain("Sleep well");
        assertThat(journeysInJourney()).isEqualTo(1);
    }

    /** Row 3: the Vault is invisible to Journey, always. */
    @Test
    void theVaultIsInvisibleToJourney() throws Exception {
        theLinds();
        send(
                HttpMethod.PUT,
                "/v1/vault",
                nora,
                "{\"publicKey\":\"%s\",\"wrappedPrivateKey\":\"AAAA\",\"salt\":\"%s\",\"kdf\":{\"n\":32768,\"r\":8,\"p\":1}}"
                        .formatted("A".repeat(43), "A".repeat(22)),
                200);
        String secret = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/vault/items",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Bank login\",\"category\":\"login\",\"ciphertext\":\"AAAA\",\"wrappedKey\":\"AAAA\"}"
                                .formatted(id(), circle),
                        201),
                "$.id");
        String bill = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/bills",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Electricity\",\"amountCents\":8420,\"dueOn\":\"2026-11-12\"}"
                                .formatted(id(), circle),
                        201),
                "$.id");
        String scan = document(nora, circle, "Passport", "P<UTO", "");
        String page = page(nora, circle, "Gift list", "me");

        // A journey can't be told from a password, a bill, a page or a document: there is no draft to put them in.
        String ask = "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"%s\":\"%s\"}";
        for (String thing : List.of(secret, bill, scan, page)) {
            send(HttpMethod.POST, "/v1/journey/drafts", nora, ask.formatted(id(), circle, "momentOf", thing), 404);
            send(HttpMethod.POST, "/v1/journey/drafts", nora, ask.formatted(id(), circle, "albumId", thing), 404);
        }
        // An album with a file in it gives a draft of its photos only, and asking for the file by name changes nothing.
        String photo = photo(nora, circle, "2026-11-07T11:00:00+01:00", "");
        String album = album(nora, circle, "Papers", ",\"itemIds\":%s".formatted(list(photo, scan)));
        String draft = JsonPath.read(
                send(HttpMethod.POST, "/v1/journey/drafts", nora, ask.formatted(id(), circle, "albumId", album), 201),
                "$.id");
        String check = send(
                HttpMethod.PUT,
                "/v1/journey/drafts/" + draft + "/check",
                nora,
                "{\"backOn\":[\"%s\",\"%s\",\"%s\"]}".formatted(scan, secret, bill),
                200);
        assertThat(JsonPath.<List<String>>read(check, "$.items[*].itemId")).containsExactly(photo);
        assertThat(JsonPath.<Boolean>read(check, "$.onlyPhotosAndVideos")).isTrue();
        send(
                HttpMethod.PATCH,
                "/v1/journey/drafts/" + draft,
                nora,
                "{\"move\":[{\"itemId\":\"%s\",\"day\":\"2026-11-07\"}]}".formatted(secret),
                400);
        finished(
                nora,
                send(
                        HttpMethod.POST,
                        "/v1/journey/drafts/" + draft + "/post",
                        nora,
                        "{\"clientId\":\"%s\"}".formatted(id()),
                        201));

        // What Journey holds now: one photo. Nothing of the Vault, of Money, of the file; and what Journey may
        // know of the circle doesn't mention them.
        String held = everythingJourneyHolds();
        assertThat(journey.doc(UUID.fromString(
                                JsonPath.read(fetch("/v1/journey/drafts/" + draft, nora), "$.journeyId")))
                        .orElseThrow()
                        .entries()
                        .get(0)
                        .shots())
                .hasSize(1);
        assertThat(held)
                .doesNotContain("Bank")
                .doesNotContain("AAAA")
                .doesNotContain("Electricity")
                .doesNotContain("Passport")
                .doesNotContain("Gift list")
                .doesNotContain(secret);
        assertThat(fetch("/v1/journey/circles", nora)).doesNotContain("vault").doesNotContain("Bank");
        assertThat(fetch("/v1/journey/me", nora)).doesNotContain("vault").doesNotContain("Bank");
    }

    /**
     * Row 4: blocking in Journey does not remove someone from a circle, and leaving a circle does not unfollow.
     * The two relationships are different; each app keeps its own.
     */
    @Test
    void whatHappensBetweenTwoPeopleInJourneyAndInACircleStayTwoThings() throws Exception {
        theLinds();
        String sharedPage = page(alex, circle, "Emergency numbers", "circle");
        UUID alexId = userId(alex);
        UUID lofoten = UUID.randomUUID();
        Doc open = new Doc(
                lofoten,
                alexId,
                "Lofoten by bike",
                JourneyVisibility.PUBLIC,
                JourneyStatus.ACTIVE,
                LocalDate.now().minusDays(2),
                9,
                null,
                List.of(),
                23,
                Map.of(userId(nora).toString(), java.time.Instant.now()),
                null,
                null,
                null,
                List.of(entry(alexId, LocalDate.now(), 12, "Ferry day", "", "Reine", null, null)));
        journey.start(open);
        String atHome = "/v1/circles/" + circle + "/journey/at-home";
        assertThat(JsonPath.<List<Object>>read(fetch(atHome, nora), "$.away")).hasSize(1);

        // In Journey, Alex shuts Nora out (a block looks like this from her side: his journey is not there for
        // her). At home she is no longer shown it, and nothing else changes: they are both in the circle, and
        // what he shared in it is still hers to read.
        journey.start(new Doc(
                lofoten,
                alexId,
                open.title(),
                JourneyVisibility.PRIVATE,
                open.status(),
                open.startDate(),
                9,
                null,
                List.of(),
                23,
                open.readAt(),
                null,
                null,
                null,
                open.entries()));
        assertThat(JsonPath.<List<Object>>read(fetch(atHome, nora), "$.away")).isEmpty();
        String members = fetch("/v1/circles/" + circle, nora);
        assertThat(JsonPath.<List<String>>read(members, "$.members[?(@.status == 'joined')].name"))
                .contains("Nora", "Alex");
        assertThat(status("/v1/pages/" + sharedPage, nora)).isEqualTo(200);
        assertThat(JsonPath.<String>read(fetch("/v1/journey/me", alex), "$.journey.username"))
                .isEqualTo("alex");

        // The other way round: the journey is public again, and Alex leaves the circle. Journey is told nothing:
        // the journey, who follows it and who read it are as they were, and Nora can still open it there.
        journey.start(open);
        String before = everythingJourneyHolds();
        String alexMember = JsonPath.read(fetch("/v1/circles/" + circle, alex), "$.myMemberId");
        send(HttpMethod.DELETE, "/v1/members/" + alexMember, alex, null, 204);
        assertThat(everythingJourneyHolds()).isEqualTo(before);
        assertThat(journey.doc(lofoten).orElseThrow().followers()).isEqualTo(23);
        assertThat(journey.doc(lofoten).orElseThrow().readAt())
                .containsKey(userId(nora).toString());
        // He is not "someone of this circle who is away" any more, so Today has no card for him.
        assertThat(JsonPath.<List<Object>>read(fetch(atHome, nora), "$.away")).isEmpty();
        assertThat(status("/v1/circles/" + circle, alex)).isEqualTo(404);
    }
}
