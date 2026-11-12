package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.journey.JourneyStatus;
import app.homeport.api.journey.JourneyVisibility;
import app.homeport.api.journey.LocalJourney.Doc;
import app.homeport.api.journey.LocalJourney.DocEntry;
import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Journey, at home: who is away shows on Today for the people who may see that journey in Journey; a day from
 * a kept journey comes back a year later; a goal follows a challenge; a trip is planned here and told there;
 * and the switch between the apps says who you are in the other one.
 */
class JourneyAtHomeTest extends JourneyApiTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 11);

    private String nora;
    private String alex;
    private String lea;
    private String circle;
    private String mia;

    private void theLinds() throws Exception {
        nora = person("Nora");
        alex = person("Alex");
        lea = person("Lea");
        circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        join(nora, circle, lea);
        mia = addMember(nora, circle, "Mia", "child");
        onJourney(nora, "nora");
        onJourney(alex, "alex");
    }

    /** Alex's journey by bike: six days in, the last two entries since Nora last read it. */
    private UUID lofoten(JourneyVisibility visibility, List<UUID> authors) throws Exception {
        UUID alexId = userId(alex);
        UUID id = UUID.randomUUID();
        Instant old = Instant.now().minusSeconds(3 * 86_400);
        Instant fresh = Instant.now().minusSeconds(3600);
        LocalDate start = TODAY.minusDays(5);
        journey.start(new Doc(
                id,
                alexId,
                "Lofoten by bike",
                visibility,
                JourneyStatus.ACTIVE,
                start,
                9,
                null,
                authors,
                23,
                Map.of(userId(nora).toString(), Instant.now().minusSeconds(2 * 86_400)),
                null,
                null,
                null,
                List.of(
                        told(alexId, start, "Off the night train", "Bodø", old),
                        told(alexId, start.plusDays(4), "Rain, then not", "Nusfjord", fresh),
                        new DocEntry(
                                UUID.randomUUID(),
                                alexId,
                                TODAY.atTime(17, 0).toInstant(ZoneOffset.UTC),
                                TODAY,
                                "Ferry day, and finally a rest",
                                "Legs up.",
                                "Reine",
                                67.932,
                                13.089,
                                List.of(journey.photo(lighter(picture()), null, null)),
                                4,
                                List.of(),
                                fresh))));
        return id;
    }

    private static DocEntry told(UUID author, LocalDate day, String title, String place, Instant created) {
        return new DocEntry(
                UUID.randomUUID(),
                author,
                day.atTime(18, 0).toInstant(ZoneOffset.UTC),
                day,
                title,
                "",
                place,
                null,
                null,
                List.of(),
                0,
                List.of(),
                created);
    }

    private String atHome(String token) throws Exception {
        return fetch("/v1/circles/" + circle + "/journey/at-home?day=" + TODAY, token);
    }

    private List<String> looks(String token) throws Exception {
        return JsonPath.read(fetch("/v1/circles/" + circle + "/today?day=" + TODAY, token), "$.cards[*].look");
    }

    // ---------- who is away ----------

    @Test
    void someoneAwayShowsOnTodayForThoseWhoMaySeeTheirJourneyInJourneyAndForNobodyElse() throws Exception {
        theLinds();
        UUID lofoten = lofoten(JourneyVisibility.PUBLIC, List.of());

        String home = atHome(nora);
        assertThat(JsonPath.<Boolean>read(home, "$.available")).isTrue();
        assertThat(JsonPath.<String>read(home, "$.away[0].who.name")).isEqualTo("Alex");
        assertThat(JsonPath.<String>read(home, "$.away[0].journey.title")).isEqualTo("Lofoten by bike");
        assertThat(JsonPath.<String>read(home, "$.away[0].journey.progressLabel"))
                .isEqualTo("Day 6 of 9");
        assertThat(JsonPath.<Integer>read(home, "$.away[0].newCount")).isEqualTo(2);
        assertThat(JsonPath.<String>read(home, "$.away[0].latest.label")).isEqualTo("Day 6");
        assertThat(JsonPath.<String>read(home, "$.away[0].latest.place")).isEqualTo("Reine");
        assertThat(JsonPath.<String>read(home, "$.away[0].latest.title")).isEqualTo("Ferry day, and finally a rest");
        assertThat(JsonPath.<String>read(home, "$.away[0].latest.imageUrl")).isNotBlank();
        assertThat(JsonPath.<String>read(home, "$.away[0].journey.openUrl")).isEqualTo("journey://journey/" + lofoten);

        // The card on Today says the same in a line.
        String today = fetch("/v1/circles/" + circle + "/today?day=" + TODAY, nora);
        String card = "$.cards[?(@.look == 'journey_away')]";
        assertThat(JsonPath.<List<String>>read(today, card + ".title")).containsExactly("Alex is on a journey");
        assertThat(JsonPath.<List<String>>read(today, card + ".line")).containsExactly("Lofoten by bike · Day 6 of 9");
        assertThat(JsonPath.<List<String>>read(today, card + ".figure")).containsExactly("2 new");
        assertThat(JsonPath.<List<String>>read(today, card + ".action")).containsExactly("Open in Journey");

        // Alex himself is not told that he is away. Lea, who is in the circle, sees a public journey too.
        assertThat(JsonPath.<List<Object>>read(atHome(alex), "$.away")).isEmpty();
        assertThat(looks(alex)).doesNotContain("journey_away");
        assertThat(JsonPath.<List<Object>>read(atHome(lea), "$.away")).hasSize(1);
        // Someone outside the circle learns nothing here, whatever Journey would show them.
        String stranger = person("Stranger");
        assertThat(status("/v1/circles/" + circle + "/journey/at-home", stranger))
                .isEqualTo(404);

        // Alex makes it private, for its authors only. In Journey it is now there for nobody else, and so at home:
        // being in his circle shows nobody what Journey itself would not.
        Doc now = journey.doc(lofoten).orElseThrow();
        journey.start(new Doc(
                now.id(),
                now.ownerId(),
                now.title(),
                JourneyVisibility.PRIVATE,
                now.status(),
                now.startDate(),
                now.targetDays(),
                null,
                List.of(userId(nora)),
                now.followers(),
                now.readAt(),
                null,
                null,
                null,
                now.entries()));
        assertThat(JsonPath.<List<Object>>read(atHome(lea), "$.away")).isEmpty();
        assertThat(looks(lea)).doesNotContain("journey_away");
        // Nora writes in it now. To her it is her own journey, not someone else's who is away.
        assertThat(JsonPath.<List<Object>>read(atHome(nora), "$.away")).isEmpty();
    }

    @Test
    void aHeartGivenAtHomeStaysAtHome() throws Exception {
        theLinds();
        UUID lofoten = lofoten(JourneyVisibility.PUBLIC, List.of());
        String entry = JsonPath.read(atHome(nora), "$.away[0].latest.entryId");
        Doc before = journey.doc(lofoten).orElseThrow();

        // Nora gives one for Mia, who has no phone, and one of her own.
        String love = "/v1/circles/" + circle + "/journey/entries/" + entry + "/love";
        send(HttpMethod.PUT, love + "?as=" + mia, nora, null, 200);
        String loved = send(HttpMethod.PUT, love, nora, null, 200);
        assertThat(JsonPath.<List<String>>read(loved, "$[0].latest.lovedBy[*].name"))
                .containsExactly("Mia", "Nora");
        assertThat(JsonPath.<Boolean>read(loved, "$[0].latest.loved")).isTrue();
        send(HttpMethod.PUT, love, nora, null, 200);
        // Lea sees who loved it; her own heart is not among them.
        assertThat(JsonPath.<List<String>>read(atHome(lea), "$.away[0].latest.lovedBy[*].name"))
                .containsExactly("Mia", "Nora");
        assertThat(JsonPath.<Boolean>read(atHome(lea), "$.away[0].latest.loved"))
                .isFalse();
        String unloved = send(HttpMethod.DELETE, love, nora, null, 200);
        assertThat(JsonPath.<List<String>>read(unloved, "$[0].latest.lovedBy[*].name"))
                .containsExactly("Mia");

        // Journey was told nothing: the entry has the likes it had.
        assertThat(journey.doc(lofoten).orElseThrow()).isEqualTo(before);

        // Only an entry that is being shown to you can be loved (Alex isn't shown his own journey as someone
        // away), and nobody gives a heart for someone with a phone of their own.
        send(
                HttpMethod.PUT,
                "/v1/circles/" + circle + "/journey/entries/" + UUID.randomUUID() + "/love",
                nora,
                null,
                404);
        send(HttpMethod.PUT, love + "?as=" + mia, alex, null, 404);
        String leaMember = JsonPath.read(fetch("/v1/circles/" + circle, lea), "$.myMemberId");
        send(HttpMethod.PUT, love + "?as=" + leaMember, nora, null, 403);
    }

    // ---------- on this day ----------

    @Test
    void aDayFromAKeptJourneyComesBackOnTheSameDayInLaterYears() throws Exception {
        theLinds();
        UUID noraId = userId(nora);
        LocalDate then = TODAY.minusYears(2);
        UUID java = journeyOf(
                nora,
                "Java and Bali by train",
                JourneyVisibility.PUBLIC,
                JourneyStatus.COMPLETED,
                then.minusDays(21),
                List.of(),
                entry(noraId, then.minusDays(21), 9, "Landed", "Hot.", "Jakarta", -6.2, 106.8),
                entry(
                        noraId,
                        then,
                        5,
                        "Sunrise over Bromo",
                        "Up at three.",
                        "Mount Bromo",
                        -7.94,
                        112.95,
                        journey.photo(lighter(picture()), null, null)),
                entry(noraId, then.plusDays(1), 9, "Down again", "", "Malang", null, null));
        String keptId = JsonPath.read(keep(nora, circle, java, ",\"audience\":\"me\""), "$.subjectId");
        String pageId = JsonPath.read(fetch("/v1/journey/kept/" + keptId, nora), "$.pageId");

        String home = atHome(nora);
        assertThat(JsonPath.<List<Object>>read(home, "$.onThisDay")).hasSize(1);
        assertThat(JsonPath.<Integer>read(home, "$.onThisDay[0].yearsAgo")).isEqualTo(2);
        assertThat(JsonPath.<String>read(home, "$.onThisDay[0].title")).isEqualTo("Sunrise over Bromo");
        assertThat(JsonPath.<String>read(home, "$.onThisDay[0].label")).isEqualTo("Day 22");
        assertThat(JsonPath.<String>read(home, "$.onThisDay[0].place")).isEqualTo("Mount Bromo");
        assertThat(JsonPath.<String>read(home, "$.onThisDay[0].imageUrl")).isNotBlank();
        assertThat(JsonPath.<String>read(home, "$.onThisDay[0].pageId")).isEqualTo(pageId);
        String today = fetch("/v1/circles/" + circle + "/today?day=" + TODAY, nora);
        String card = "$.cards[?(@.look == 'journey_on_this_day')]";
        assertThat(JsonPath.<List<String>>read(today, card + ".title")).containsExactly("Sunrise over Bromo");
        assertThat(JsonPath.<List<String>>read(today, card + ".line"))
                .containsExactly("2 years ago · Day 22 · kept journey");
        assertThat(JsonPath.<List<String>>read(today, card + ".thingId")).containsExactly(pageId);
        // The day after, it is the next day's turn; the day before, nobody's.
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/journey/at-home?day=" + TODAY.plusDays(1), nora),
                        "$.onThisDay[*].title"))
                .containsExactly("Down again");
        assertThat(JsonPath.<List<Object>>read(
                        fetch("/v1/circles/" + circle + "/journey/at-home?day=" + TODAY.minusDays(1), nora),
                        "$.onThisDay"))
                .isEmpty();

        // She kept it for herself: Alex is shown nothing of it, on Today or anywhere.
        assertThat(JsonPath.<List<Object>>read(atHome(alex), "$.onThisDay")).isEmpty();
        assertThat(looks(alex)).doesNotContain("journey_on_this_day");
        shareWith(nora, pageId, "{\"audience\":\"circle\"}");
        assertThat(JsonPath.<List<String>>read(atHome(alex), "$.onThisDay[*].title"))
                .containsExactly("Sunrise over Bromo");
    }

    // ---------- one account, two apps ----------

    @Test
    void theSwitchShowsYourJourneyProfileAndNothingMore() throws Exception {
        theLinds();
        String mine = fetch("/v1/journey/me", nora);
        assertThat(JsonPath.<String>read(mine, "$.mode")).isEqualTo("local");
        assertThat(JsonPath.<Boolean>read(mine, "$.available")).isTrue();
        assertThat(JsonPath.<String>read(mine, "$.signedInAs")).isEqualTo("Nora");
        assertThat(JsonPath.<String>read(mine, "$.journey.username")).isEqualTo("nora");
        assertThat(JsonPath.<String>read(mine, "$.journey.displayName")).isEqualTo("Nora");
        assertThat(JsonPath.<Integer>read(mine, "$.journey.following")).isEqualTo(58);
        assertThat(JsonPath.<Integer>read(mine, "$.journey.followers")).isEqualTo(12);
        assertThat(JsonPath.<String>read(mine, "$.journey.openUrl")).isEqualTo("journey://profile/nora");
        assertThat(JsonPath.<Map<String, Object>>read(mine, "$").keySet())
                .containsExactlyInAnyOrder("mode", "available", "signedInAs", "journey", "note", "notYet");
        // Lea never opened Journey: there is no profile to show, and none is made for her by asking.
        String leas = fetch("/v1/journey/me", lea);
        assertThat(JsonPath.<Object>read(leas, "$.journey")).isNull();
        assertThat(JsonPath.<Boolean>read(leas, "$.available")).isTrue();
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/journey/journeys", lea), "$.items"))
                .isEmpty();
    }

    // ---------- goals and challenges ----------

    @Test
    void aGoalThatFollowsAChallengeReadsItsTickedDaysForThoseWhoMaySeeTheChallenge() throws Exception {
        theLinds();
        UUID noraId = userId(nora);
        LocalDate start = TODAY.minusDays(11);
        UUID challenge = UUID.randomUUID();
        journey.start(new Doc(
                challenge,
                noraId,
                "Family 10K",
                JourneyVisibility.PRIVATE,
                JourneyStatus.ACTIVE,
                start,
                30,
                null,
                List.of(userId(alex)),
                0,
                Map.of(),
                null,
                "family-10k",
                null,
                java.util.stream.IntStream.range(0, 12)
                        .mapToObj(day -> told(noraId, start.plusDays(day), "", null, Instant.now()))
                        .toList()));
        String goal = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/goals",
                        nora,
                        ("{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Family 10K\",\"audience\":\"circle\",\"unit\":\"count\","
                                        + "\"target\":30,\"current\":3,\"source\":{\"kind\":\"journey\",\"ref\":\"family-10k\","
                                        + "\"words\":\"a challenge\"}}")
                                .formatted(id(), circle),
                        201),
                "$.id");

        // Nora and Alex write in the challenge: the goal reads its twelve ticked days, by name or by Journey's id.
        for (String who : List.of(nora, alex)) {
            String read = fetch("/v1/goals/" + goal, who);
            assertThat(JsonPath.<Integer>read(read, "$.current")).isEqualTo(12);
            assertThat(JsonPath.<Boolean>read(read, "$.source.live")).isTrue();
            assertThat(JsonPath.<String>read(read, "$.source.line")).isEqualTo("Reads Family 10K in Journey");
            assertThat(JsonPath.<String>read(read, "$.line")).isEqualTo("Day 12 of 30 in Journey");
        }
        // Lea may see the goal, but not the challenge in Journey: she is shown what was put in by hand.
        String leas = fetch("/v1/goals/" + goal, lea);
        assertThat(JsonPath.<Integer>read(leas, "$.current")).isEqualTo(3);
        assertThat(JsonPath.<Boolean>read(leas, "$.source.live")).isFalse();

        send(
                HttpMethod.PATCH,
                "/v1/goals/" + goal,
                nora,
                "{\"source\":{\"kind\":\"journey\",\"ref\":\"%s\",\"words\":\"a challenge\"}}".formatted(challenge),
                200);
        assertThat(JsonPath.<Integer>read(fetch("/v1/goals/" + goal, nora), "$.current"))
                .isEqualTo(12);
    }

    // ---------- a trip, start to finish ----------

    @Test
    void aTripIsPlannedHereBecomesAJourneyAndComesBackAsABookWithWhatItCost() throws Exception {
        theLinds();
        String trips = JsonPath.read(
                fetch(
                        "/v1/journey/journeys/" + lofoten(JourneyVisibility.PUBLIC, List.of(userId(nora)))
                                + "/keep-options?circleId=" + circle,
                        nora),
                "$.keepIn.folderId");
        String folder = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/folders",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Norway 2027\",\"parentId\":\"%s\",\"audience\":\"circle\"}"
                                .formatted(id(), circle, trips),
                        201),
                "$.id");
        // A folder is not a trip until it has dates.
        assertThat(status("/v1/trips/" + folder, nora)).isEqualTo(404);
        send(HttpMethod.PUT, "/v1/trips/" + folder, nora, "{\"startsOn\":\"2027-04-03\"}", 400);
        send(
                HttpMethod.PUT,
                "/v1/trips/" + folder,
                nora,
                "{\"startsOn\":\"2027-04-17\",\"endsOn\":\"2027-04-03\"}",
                400);

        // The plan: a page with the stops, a packing list, the budget.
        String plan = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/pages",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Day by day\",\"body\":\"14 days sketched\",\"audience\":\"circle\",\"folderId\":\"%s\"}"
                                .formatted(id(), circle, folder),
                        201),
                "$.id");
        for (String stop : List.of("Bergen", "Tromsø")) {
            send(
                    HttpMethod.POST,
                    "/v1/pages/" + plan + "/blocks",
                    nora,
                    "{\"clientId\":\"%s\",\"kind\":\"place\",\"text\":\"%s\"}".formatted(id(), stop),
                    201);
        }
        send(
                HttpMethod.POST,
                "/v1/checklists",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Packing\",\"audience\":\"circle\",\"folderId\":\"%s\",\"items\":[\"Socks\",\"Passports\"]}"
                        .formatted(id(), circle, folder),
                201);
        String sheet = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/sheets",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Norway budget\",\"template\":\"trip_budget\",\"audience\":\"circle\"}"
                                .formatted(id(), circle),
                        201),
                "$.id");

        String trip = send(
                HttpMethod.PUT,
                "/v1/trips/" + folder + "?day=2026-11-11",
                nora,
                "{\"startsOn\":\"2027-04-03\",\"endsOn\":\"2027-04-17\",\"budgetSheetId\":\"%s\"}".formatted(sheet),
                200);
        assertThat(JsonPath.<String>read(trip, "$.title")).isEqualTo("Norway 2027");
        assertThat(JsonPath.<String>read(trip, "$.space")).isEqualTo("Trips");
        assertThat(JsonPath.<String>read(trip, "$.stage")).isEqualTo("plan");
        assertThat(JsonPath.<List<String>>read(trip, "$.items[*].title")).containsExactly("Day by day", "Packing");
        assertThat(JsonPath.<String>read(trip, "$.items[0].glance")).isEqualTo("14 days sketched");
        assertThat(JsonPath.<Integer>read(trip, "$.items[1].left")).isEqualTo(2);
        assertThat(JsonPath.<String>read(trip, "$.money.sheetId")).isEqualTo(sheet);
        assertThat(JsonPath.<String>read(trip, "$.money.title")).isEqualTo("Norway budget");
        assertThat(JsonPath.<String>read(trip, "$.money.currency")).isEqualTo("EUR");
        assertThat(JsonPath.<String>read(trip, "$.becomes.on")).isEqualTo("2027-04-03");
        assertThat(JsonPath.<String>read(trip, "$.becomes.title")).isEqualTo("Norway 2027");
        assertThat(JsonPath.<List<String>>read(trip, "$.becomes.coAuthors[*].name"))
                .containsExactlyInAnyOrder("Alex", "Lea");
        assertThat(JsonPath.<List<String>>read(trip, "$.becomes.route")).containsExactly("Bergen", "Tromsø");
        assertThat(JsonPath.<Boolean>read(trip, "$.becomes.canBecome")).isTrue();
        assertThat(JsonPath.<Object>read(trip, "$.journey")).isNull();

        // The circle's trips are the folders that have dates, for whoever may see the folder.
        String listed = fetch("/v1/circles/" + circle + "/trips?day=2026-11-11", alex);
        assertThat(JsonPath.<List<String>>read(listed, "$[*].id")).containsExactly(folder);
        assertThat(JsonPath.<List<String>>read(listed, "$[*].stage")).containsExactly("plan");
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/trips?day=2027-04-10", alex), "$[*].stage"))
                .containsExactly("go");

        // Everyone the folder is shared with sees the trip. Lea has no Journey profile and is told what to do.
        String leas = fetch("/v1/trips/" + folder, lea);
        assertThat(JsonPath.<Boolean>read(leas, "$.becomes.canBecome")).isFalse();
        assertThat(JsonPath.<String>read(leas, "$.becomes.note"))
                .isEqualTo("Open Journey once first, so there is somewhere to tell it.");
        assertThat(status("/v1/trips/" + folder, person("Stranger"))).isEqualTo(404);

        // On its first day it becomes a journey: Journey is told its title, its first day and who writes in it.
        String body = "{\"clientId\":\"%s\"}".formatted(id());
        String going = send(HttpMethod.POST, "/v1/trips/" + folder + "/journey?day=2027-04-03", nora, body, 201);
        assertThat(JsonPath.<String>read(going, "$.stage")).isEqualTo("go");
        assertThat(JsonPath.<Object>read(going, "$.becomes")).isNull();
        UUID journeyId = UUID.fromString(JsonPath.read(going, "$.journey.journeyId"));
        assertThat(JsonPath.<String>read(going, "$.journey.journey.title")).isEqualTo("Norway 2027");
        Doc told = journey.doc(journeyId).orElseThrow();
        assertThat(told.title()).isEqualTo("Norway 2027");
        assertThat(told.startDate()).isEqualTo(LocalDate.of(2027, 4, 3));
        assertThat(told.visibility()).isEqualTo(JourneyVisibility.PRIVATE);
        assertThat(told.authors()).as("Alex is on Journey; Lea isn't yet").containsExactly(userId(alex));
        assertThat(told.entries())
                .as("the plan, the list and the budget stay home")
                .isEmpty();
        // Asked again, it is the same journey.
        String again = send(
                HttpMethod.POST,
                "/v1/trips/" + folder + "/journey",
                nora,
                "{\"clientId\":\"%s\"}".formatted(id()),
                201);
        assertThat(JsonPath.<String>read(again, "$.journey.journeyId")).isEqualTo(journeyId.toString());
        assertThat(jdbc.sql("select count(*) from local_journeys")
                        .query(Integer.class)
                        .single())
                .as("Alex's journey, and the trip's: one")
                .isEqualTo(2);

        // They post from the road. Afterwards the journey is kept, for the trip: its book stands in the trip.
        journey.add(
                journeyId,
                entry(userId(nora), LocalDate.of(2027, 4, 3), 20, "Bergen", "Rain, of course.", "Bergen", 60.39, 5.32));
        String keptId = JsonPath.read(
                keep(nora, circle, journeyId, ",\"tripId\":\"%s\",\"folderId\":\"%s\"".formatted(folder, folder)),
                "$.subjectId");
        String after = fetch("/v1/trips/" + folder + "?day=2027-04-20", nora);
        assertThat(JsonPath.<String>read(after, "$.stage")).isEqualTo("keep");
        assertThat(JsonPath.<String>read(after, "$.book.id")).isEqualTo(keptId);
        assertThat(JsonPath.<String>read(after, "$.book.title")).isEqualTo("Norway 2027");
        assertThat(JsonPath.<List<String>>read(after, "$.items[*].title")).contains("Norway 2027");
        assertThat(JsonPath.<String>read(after, "$.money.sheetId")).isEqualTo(sheet);

        // Alex may look at the trip but the folder is Nora's to change; a folder stops being a trip without losing
        // anything.
        send(HttpMethod.PUT, "/v1/trips/" + folder, alex, "{\"endsOn\":\"2027-04-18\"}", 200);
        shareWith(nora, folder, "{\"audience\":\"circle\",\"everyoneEdits\":false}");
        send(HttpMethod.PUT, "/v1/trips/" + folder, alex, "{\"endsOn\":\"2027-04-19\"}", 403);
        shareWith(nora, folder, "{\"audience\":\"me\"}");
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/circles/" + circle + "/trips", alex), "$"))
                .isEmpty();
        assertThat(status("/v1/trips/" + folder, alex)).isEqualTo(404);
        assertThat(status("/v1/circles/" + circle + "/trips", person("Someone")))
                .isEqualTo(404);
        send(HttpMethod.DELETE, "/v1/trips/" + folder, nora, null, 204);
        assertThat(status("/v1/trips/" + folder, nora)).isEqualTo(404);
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/circles/" + circle + "/trips", nora), "$"))
                .isEmpty();
        assertThat(status("/v1/folders/" + folder, nora)).isEqualTo(200);
    }

    // ---------- what Journey may know of a circle ----------

    @Test
    void journeyLearnsThatACircleExistsAndWhoIsInItAndNothingElse() throws Exception {
        theLinds();
        page(nora, circle, "Gift list for Alex", "circle");
        photo(nora, circle, "2026-11-07T11:42:00+01:00", ",\"audience\":\"circle\"");

        String circles = fetch("/v1/journey/circles", nora);

        assertThat(JsonPath.<List<String>>read(circles, "$[*].name")).containsExactly("The Linds");
        assertThat(JsonPath.<String>read(circles, "$[0].kind")).isEqualTo("family");
        assertThat(JsonPath.<List<String>>read(circles, "$[0].people[*].userId"))
                .containsExactlyInAnyOrder(
                        userId(nora).toString(),
                        userId(alex).toString(),
                        userId(lea).toString());
        assertThat(JsonPath.<String>read(circles, "$[0].goodnightAt")).startsWith("20:00");
        // Exactly these facts, and no others: no child's name, nothing that is kept, no counts of it.
        assertThat(JsonPath.<Map<String, Object>>read(circles, "$[0]").keySet())
                .containsExactlyInAnyOrder("id", "name", "kind", "people", "goodnightAt", "timeZone");
        assertThat(JsonPath.<Map<String, Object>>read(circles, "$[0].people[0]").keySet())
                .containsExactlyInAnyOrder("userId", "name");
        assertThat(circles).doesNotContain("Mia").doesNotContain("Gift list");
        // A circle without children offers no goodnight; a stranger's answer has nothing of The Linds.
        String couple = circle(nora, "couple", "Nora and Alex");
        assertThat(JsonPath.<List<Object>>read(
                        fetch("/v1/journey/circles", nora), "$[?(@.id == '" + couple + "')].goodnightAt"))
                .containsExactly((Object) null);
        assertThat(fetch("/v1/journey/circles", person("Stranger"))).isEqualTo("[]");
    }
}
