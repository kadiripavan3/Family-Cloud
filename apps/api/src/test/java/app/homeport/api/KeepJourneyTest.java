package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.journey.JourneyPort.StoryRemark;
import app.homeport.api.journey.JourneyStatus;
import app.homeport.api.journey.JourneyVisibility;
import app.homeport.api.journey.LocalJourney;
import app.homeport.api.journey.LocalJourney.DocEntry;
import app.homeport.api.journey.LocalJourney.DocShot;
import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Keep a journey: the story becomes a page in Notes, its photos are matched to the originals in the Library
 * or brought in, its route goes on the kept photos, and asking again brings only what is new.
 */
class KeepJourneyTest extends JourneyApiTest {

    private static final LocalDate APRIL = LocalDate.of(2026, 4, 1);

    private String nora;
    private String alex;
    private String circle;
    private String firstOriginal;
    private String secondOriginal;
    private String thirdOriginal;

    /**
     * Nora's Iceland: two days, three photos whose originals her phone backed up (one known by its
     * fingerprint, two by when they were taken), one photo that came from Alex's phone, and a clip.
     */
    private UUID iceland(JourneyVisibility visibility) throws Exception {
        nora = person("Nora");
        alex = person("Alex");
        circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        onJourney(nora, "nora");
        UUID noraId = userId(nora);

        byte[] one = picture();
        byte[] two = picture();
        byte[] three = picture();
        firstOriginal = JsonPath.read(
                addOne(
                        nora,
                        circle,
                        sendFile(nora, "photo", "image/jpeg", one, ""),
                        ",\"takenAt\":\"2026-04-01T10:15:00Z\""),
                "$.items[0].item.id");
        secondOriginal = JsonPath.read(
                addOne(
                        nora,
                        circle,
                        sendFile(nora, "photo", "image/jpeg", two, ""),
                        ",\"takenAt\":\"2026-04-01T16:40:07Z\""),
                "$.items[0].item.id");
        thirdOriginal = JsonPath.read(
                addOne(
                        nora,
                        circle,
                        sendFile(nora, "photo", "image/jpeg", three, ""),
                        ",\"takenAt\":\"2026-04-02T08:05:30Z\""),
                "$.items[0].item.id");

        DocShot byFingerprint = journey.photo(lighter(one), null, LocalJourney.fingerprint(one));
        DocShot byTime = journey.photo(lighter(two), Instant.parse("2026-04-01T16:40:07Z"), null);
        DocShot fromAlexsPhone = journey.photo(lighter(picture()), Instant.parse("2026-04-01T17:00:00Z"), null);
        DocShot nextMorning = journey.photo(lighter(three), Instant.parse("2026-04-02T08:05:31Z"), null);
        DocShot clip =
                journey.clip("a clip".getBytes(), lighter(picture()), 12, Instant.parse("2026-04-02T09:00:00Z"), null);
        return journeyOf(
                nora,
                "Iceland ring road",
                visibility,
                JourneyStatus.COMPLETED,
                APRIL,
                List.of(userId(alex)),
                entry(
                        noraId,
                        APRIL,
                        10,
                        "Picked up the van",
                        "Got lost twice before leaving the car park.",
                        "Reykjavík",
                        64.1466,
                        -21.9426,
                        byFingerprint,
                        byTime,
                        fromAlexsPhone),
                entry(
                        noraId,
                        APRIL.plusDays(1),
                        8,
                        "",
                        "A rainbow at the falls and nobody else there until nine.",
                        "Skógafoss",
                        63.5321,
                        -19.5114,
                        nextMorning,
                        clip));
    }

    @Test
    void aKeptJourneyIsAPageWithEachDayItsWordsAndPhotosAndItsOriginalsAreFoundInTheLibrary() throws Exception {
        UUID iceland = iceland(JourneyVisibility.PUBLIC);

        // Before keeping: what the sheet shows. Three of the five are in the Library already.
        String options = fetch("/v1/journey/journeys/" + iceland + "/keep-options?circleId=" + circle, nora);
        assertThat(JsonPath.<String>read(options, "$.journey.title")).isEqualTo("Iceland ring road");
        assertThat(JsonPath.<Integer>read(options, "$.photos")).isEqualTo(4);
        assertThat(JsonPath.<Integer>read(options, "$.clips")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(options, "$.inLibrary")).isEqualTo(3);
        assertThat(JsonPath.<String>read(options, "$.keepIn.title")).isEqualTo("Trips");
        assertThat(JsonPath.<String>read(options, "$.audience")).isEqualTo("circle");
        assertThat(JsonPath.<Object>read(options, "$.keptId")).isNull();
        String trips = JsonPath.read(options, "$.keepIn.folderId");

        String job = keep(nora, circle, iceland, ",\"folderId\":\"%s\"".formatted(trips));
        String keptId = JsonPath.read(job, "$.subjectId");
        String kept = fetch("/v1/journey/kept/" + keptId, nora);
        assertThat(JsonPath.<Integer>read(kept, "$.originals.matched")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(kept, "$.originals.brought")).isEqualTo(2);
        assertThat(JsonPath.<Integer>read(kept, "$.originals.leftInJourney")).isZero();
        assertThat(JsonPath.<String>read(kept, "$.byline")).isEqualTo("Nora and Alex");
        assertThat(JsonPath.<Integer>read(kept, "$.stats.days")).isEqualTo(2);
        assertThat(JsonPath.<Integer>read(kept, "$.stats.entries")).isEqualTo(2);
        assertThat(JsonPath.<Integer>read(kept, "$.stats.photos")).isEqualTo(4);
        assertThat(JsonPath.<Integer>read(kept, "$.stats.followers")).isEqualTo(58);
        assertThat(JsonPath.<String>read(kept, "$.coverUrl")).isNotBlank();
        String pageId = JsonPath.read(kept, "$.pageId");
        String albumId = JsonPath.read(kept, "$.albumId");

        // The page is an ordinary page: the numbers, then each day under its heading, in the Trips space.
        String page = fetch("/v1/pages/" + pageId, nora);
        assertThat(JsonPath.<String>read(page, "$.title")).isEqualTo("Iceland ring road");
        assertThat(JsonPath.<String>read(page, "$.folderId")).isEqualTo(trips);
        assertThat(JsonPath.<String>read(page, "$.chip.audience")).isEqualTo("circle");
        // The cover, the numbers, then each day: its heading, its words, its photos.
        assertThat(JsonPath.<List<String>>read(page, "$.blocks[*].kind"))
                .containsExactly(
                        "photo",
                        "paragraph",
                        "heading",
                        "paragraph",
                        "photo",
                        "photo",
                        "photo",
                        "heading",
                        "paragraph",
                        "photo",
                        "photo");
        assertThat(JsonPath.<String>read(page, "$.blocks[1].text"))
                .isEqualTo("A journey by Nora and Alex. 2 days, 2 entries, 4 photos.");
        assertThat(JsonPath.<String>read(page, "$.blocks[2].text")).isEqualTo("Day 1 · Reykjavík · Wed 1 Apr 2026");
        assertThat(JsonPath.<String>read(page, "$.blocks[3].text"))
                .isEqualTo("Picked up the van\nGot lost twice before leaving the car park.");
        assertThat(JsonPath.<String>read(page, "$.blocks[3].marks[0].kind")).isEqualTo("bold");
        assertThat(JsonPath.<String>read(page, "$.blocks[7].text")).isEqualTo("Day 2 · Skógafoss · Thu 2 Apr 2026");
        assertThat(JsonPath.<String>read(page, "$.body")).contains("A rainbow at the falls");

        // The book's screen reads the same page, day by day.
        String book = fetch("/v1/journey/books/" + pageId, nora);
        assertThat(JsonPath.<List<String>>read(book, "$.days[*].label")).containsExactly("Day 1", "Day 2");
        assertThat(JsonPath.<List<String>>read(book, "$.days[*].place")).containsExactly("Reykjavík", "Skógafoss");
        assertThat(JsonPath.<List<Integer>>read(book, "$.days[*].shots")).containsExactly(3, 2);
        assertThat(JsonPath.<List<Integer>>read(book, "$.days[*].more")).containsExactly(0, 0);
        assertThat(JsonPath.<List<String>>read(book, "$.days[0].photos[*].url")).hasSize(3);
        assertThat(JsonPath.<List<String>>read(book, "$.days[1].words"))
                .containsExactly("A rainbow at the falls and nobody else there until nine.");
        assertThat(JsonPath.<String>read(book, "$.kept.id")).isEqualTo(keptId);
        assertThat(JsonPath.<String>read(book, "$.job.status")).isEqualTo("done");

        // The Library holds each picture once: the three originals, and the two that were brought.
        List<String> wall = wall(nora, circle, "?limit=50");
        assertThat(wall).hasSize(5).contains(firstOriginal, secondOriginal, thirdOriginal);
        String album = fetch("/v1/albums/" + albumId, nora);
        assertThat(JsonPath.<String>read(album, "$.origin")).isEqualTo("journey");
        assertThat(JsonPath.<Integer>read(album, "$.count")).isEqualTo(5);
        assertThat(JsonPath.<String>read(album, "$.title")).isEqualTo("Iceland ring road");
        assertThat(wall(nora, circle, "?album=" + albumId)).containsExactlyInAnyOrderElementsOf(wall);
        // An original stays what it was: full size, its own fingerprint. What was brought has Journey's size.
        assertThat(JsonPath.<Integer>read(fetch("/v1/library/" + firstOriginal, nora), "$.item.width"))
                .isEqualTo(48);
        String brought = wall.stream()
                .filter(id ->
                        !List.of(firstOriginal, secondOriginal, thirdOriginal).contains(id))
                .filter(id -> {
                    try {
                        return JsonPath.<String>read(fetch("/v1/library/" + id, nora), "$.item.kind")
                                .equals("photo");
                    } catch (Exception e) {
                        throw new IllegalStateException(e);
                    }
                })
                .findFirst()
                .orElseThrow();
        String broughtItem = fetch("/v1/library/" + brought, nora);
        assertThat(JsonPath.<Integer>read(broughtItem, "$.item.width")).isEqualTo(24);
        assertThat(JsonPath.<String>read(broughtItem, "$.item.placeName")).isEqualTo("Reykjavík");
        assertThat(JsonPath.<String>read(broughtItem, "$.item.chip.audience")).isEqualTo("circle");
        // The route: the originals that didn't say where they were taken now do, and the map can draw the line.
        assertThat(JsonPath.<String>read(fetch("/v1/library/" + thirdOriginal, nora), "$.item.placeName"))
                .isEqualTo("Skógafoss");
        String routes = fetch("/v1/circles/" + circle + "/journey/routes", nora);
        assertThat(JsonPath.<List<String>>read(routes, "$[0].points[*].place"))
                .containsExactly("Reykjavík", "Skógafoss");
        assertThat(JsonPath.<List<Integer>>read(routes, "$[0].points[*].number"))
                .containsExactly(1, 2);

        // Alex is in the circle and it was kept for everyone: he reads the book. A stranger learns nothing.
        assertThat(JsonPath.<String>read(fetch("/v1/journey/books/" + pageId, alex), "$.kept.title"))
                .isEqualTo("Iceland ring road");
        assertThat(JsonPath.<Boolean>read(fetch("/v1/journey/kept/" + keptId, alex), "$.mine"))
                .isFalse();
        String stranger = person("Stranger");
        assertThat(status("/v1/journey/books/" + pageId, stranger)).isEqualTo(404);
        assertThat(status("/v1/journey/kept/" + keptId, stranger)).isEqualTo(404);
        assertThat(status("/v1/journey/jobs/" + JsonPath.<String>read(job, "$.id"), alex))
                .isEqualTo(404);
    }

    @Test
    void keepingAgainBringsWhatWasAddedSinceAndNothingTwice() throws Exception {
        UUID iceland = iceland(JourneyVisibility.PUBLIC);
        String job = keep(nora, circle, iceland, "");
        String keptId = JsonPath.read(job, "$.subjectId");
        String pageId = JsonPath.read(fetch("/v1/journey/kept/" + keptId, nora), "$.pageId");
        int blocks = JsonPath.<List<Object>>read(fetch("/v1/pages/" + pageId, nora), "$.blocks")
                .size();

        // Asking again with nothing new changes nothing: the same page, the same photos, the same kept journey.
        String again = keep(nora, circle, iceland, "");
        assertThat(JsonPath.<String>read(again, "$.subjectId")).isEqualTo(keptId);
        assertThat(JsonPath.<String>read(again, "$.step")).isEqualTo("Up to date");
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/pages/" + pageId, nora), "$.blocks"))
                .hasSize(blocks);
        assertThat(wall(nora, circle, "?limit=50")).hasSize(5);
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/circles/" + circle + "/journey/kept", nora), "$.items"))
                .hasSize(1);
        String options = fetch("/v1/journey/journeys/" + iceland + "/keep-options?circleId=" + circle, nora);
        assertThat(JsonPath.<String>read(options, "$.keptId")).isEqualTo(keptId);
        assertThat(JsonPath.<String>read(options, "$.pageId")).isEqualTo(pageId);

        // A late entry: something from the first evening, and a third day. Each lands where it belongs, once.
        UUID noraId = userId(nora);
        DocShot late = journey.photo(lighter(picture()), Instant.parse("2026-04-01T21:00:00Z"), null);
        journey.add(
                iceland,
                new DocEntry(
                        UUID.randomUUID(),
                        noraId,
                        Instant.parse("2026-04-01T21:00:00Z"),
                        APRIL,
                        "Hot dogs by the harbour",
                        "In the rain.",
                        "Reykjavík",
                        64.15,
                        -21.94,
                        List.of(late),
                        3,
                        List.of(new StoryRemark("Lea Novak", "So jealous.")),
                        Instant.now()));
        journey.add(iceland, entry(noraId, APRIL.plusDays(2), 12, "Black sand", "Windy.", "Vík", 63.4186, -19.006));
        keep(nora, circle, iceland, "");
        keep(nora, circle, iceland, "");

        String page = fetch("/v1/pages/" + pageId, nora);
        assertThat(JsonPath.<List<String>>read(page, "$.blocks[*].kind"))
                .containsExactly(
                        "photo",
                        "paragraph",
                        "heading",
                        "paragraph",
                        "photo",
                        "photo",
                        "photo",
                        "paragraph",
                        "photo",
                        "heading",
                        "paragraph",
                        "photo",
                        "photo",
                        "heading",
                        "paragraph");
        assertThat(JsonPath.<String>read(page, "$.blocks[7].text")).isEqualTo("Hot dogs by the harbour\nIn the rain.");
        assertThat(JsonPath.<String>read(page, "$.blocks[13].text")).isEqualTo("Day 3 · Vík · Fri 3 Apr 2026");
        assertThat(wall(nora, circle, "?limit=50")).hasSize(6);
        String kept = fetch("/v1/journey/kept/" + keptId, nora);
        assertThat(JsonPath.<Integer>read(kept, "$.stats.entries")).isEqualTo(4);
        assertThat(JsonPath.<Integer>read(kept, "$.originals.brought")).isEqualTo(3);
        assertThat(JsonPath.<List<Integer>>read(fetch("/v1/journey/books/" + pageId, nora), "$.days[*].shots"))
                .containsExactly(4, 2, 0);

        // The same request sent twice (a retry that lost its answer) is one job.
        String body = "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"journeyId\":\"%s\"}".formatted(id(), circle, iceland);
        String first = send(HttpMethod.POST, "/v1/journey/keeps", nora, body, 201);
        String second = send(HttpMethod.POST, "/v1/journey/keeps", nora, body, 201);
        assertThat(JsonPath.<String>read(second, "$.id")).isEqualTo(JsonPath.<String>read(first, "$.id"));
        finished(nora, first);
        assertThat(jdbc.sql("select count(*) from kept_entries")
                        .query(Integer.class)
                        .single())
                .isEqualTo(4);
        assertThat(jdbc.sql("select count(*) from kept_media")
                        .query(Integer.class)
                        .single())
                .isEqualTo(6);
    }

    @Test
    void whoMaySeeAKeptJourneyIsWhoMaySeeItsPageAndItsAlbum() throws Exception {
        UUID iceland = iceland(JourneyVisibility.PRIVATE);
        // A private journey starts at home the way things do in a family: only its keeper's.
        assertThat(JsonPath.<String>read(
                        fetch("/v1/journey/journeys/" + iceland + "/keep-options?circleId=" + circle, nora),
                        "$.audience"))
                .isEqualTo("me");
        String keptId = JsonPath.read(keep(nora, circle, iceland, ""), "$.subjectId");
        String kept = fetch("/v1/journey/kept/" + keptId, nora);
        String pageId = JsonPath.read(kept, "$.pageId");
        String albumId = JsonPath.read(kept, "$.albumId");

        // Alex wrote in the journey, and is in the circle. At home it is Nora's until she shares it.
        assertThat(status("/v1/journey/kept/" + keptId, alex)).isEqualTo(404);
        assertThat(status("/v1/journey/books/" + pageId, alex)).isEqualTo(404);
        assertThat(status("/v1/pages/" + pageId, alex)).isEqualTo(404);
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/circles/" + circle + "/journey/kept", alex), "$.items"))
                .isEmpty();
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/circles/" + circle + "/journey/routes", alex), "$"))
                .isEmpty();
        assertThat(fetch("/v1/circles/" + circle + "/search?q=Iceland", alex)).doesNotContain("Iceland ring road");
        // What was brought into the Library is Nora's alone too; her originals were never his to see.
        assertThat(wall(alex, circle, "?limit=50")).isEmpty();

        // She shares the album: he sees that a journey was kept, and its photos as far as each is shared with him.
        shareWith(nora, albumId, "{\"audience\":\"circle\"}");
        String forAlex = fetch("/v1/journey/kept/" + keptId, alex);
        assertThat(JsonPath.<String>read(forAlex, "$.albumId")).isEqualTo(albumId);
        assertThat(JsonPath.<Object>read(forAlex, "$.pageId")).isNull();
        assertThat(status("/v1/journey/books/" + pageId, alex)).isEqualTo(404);
        // Then the book. He reads it, and can't stop her keeping it.
        shareWith(nora, pageId, "{\"audience\":\"circle\",\"everyoneEdits\":false}");
        assertThat(JsonPath.<Boolean>read(fetch("/v1/journey/books/" + pageId, alex), "$.canEdit"))
                .isFalse();
        send(HttpMethod.DELETE, "/v1/journey/kept/" + keptId, alex, null, 403);

        // Only someone who writes in a journey can bring it home. To anyone else, and for a journey that isn't
        // there, the answer is the same.
        String lea = person("Lea");
        join(nora, circle, lea);
        onJourney(lea, "lea");
        String ask = "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"journeyId\":\"%s\"}";
        send(HttpMethod.POST, "/v1/journey/keeps", lea, ask.formatted(id(), circle, iceland), 404);
        send(HttpMethod.POST, "/v1/journey/keeps", lea, ask.formatted(id(), circle, UUID.randomUUID()), 404);
        assertThat(status("/v1/journey/journeys/" + iceland + "/keep-options?circleId=" + circle, lea))
                .isEqualTo(404);

        // Nora stops keeping it: the link is gone, the page and the photos stay.
        send(HttpMethod.DELETE, "/v1/journey/kept/" + keptId, nora, null, 204);
        assertThat(status("/v1/journey/books/" + pageId, nora)).isEqualTo(404);
        assertThat(status("/v1/pages/" + pageId, nora)).isEqualTo(200);
        assertThat(wall(nora, circle, "?limit=50")).hasSize(5);
    }

    @Test
    void theFourSwitchesDecideWhatComesHome() throws Exception {
        UUID iceland = iceland(JourneyVisibility.PUBLIC);
        journey.add(
                iceland,
                new DocEntry(
                        UUID.randomUUID(),
                        userId(nora),
                        APRIL.plusDays(2).atTime(9, 0).toInstant(ZoneOffset.UTC),
                        APRIL.plusDays(2),
                        "Vík",
                        "Black sand.",
                        "Vík",
                        63.4186,
                        -19.006,
                        List.of(),
                        24,
                        List.of(new StoryRemark("Lea Novak", "So jealous."), new StoryRemark("Kai", "Next year!")),
                        Instant.now()));

        // Only the book, with the kind words, and without the route.
        String keptId = JsonPath.read(
                keep(nora, circle, iceland, ",\"originals\":false,\"route\":false,\"words\":true"), "$.subjectId");
        String kept = fetch("/v1/journey/kept/" + keptId, nora);
        assertThat(JsonPath.<Object>read(kept, "$.albumId")).isNull();
        assertThat(wall(nora, circle, "?limit=50"))
                .as("nothing was added to the Library")
                .hasSize(3);
        String page = fetch("/v1/pages/" + JsonPath.<String>read(kept, "$.pageId"), nora);
        assertThat(JsonPath.<List<String>>read(page, "$.blocks[?(@.kind == 'bullet')].text"))
                .containsExactly("Liked by 24", "Lea: So jealous.", "Kai: Next year!");
        assertThat(JsonPath.<List<Object>>read(page, "$.blocks[?(@.kind == 'photo')]"))
                .as("the cover and the five of the story")
                .hasSize(6);
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/circles/" + circle + "/journey/routes", nora), "$"))
                .isEmpty();
        assertThat(JsonPath.<Object>read(fetch("/v1/library/" + thirdOriginal, nora), "$.item.placeName"))
                .isNull();

        // Alex keeps the same journey for himself, in the circle of the two of them: only the originals.
        onJourney(alex, "alex");
        String couple = circle(alex, "couple", "Nora and Alex");
        String his = JsonPath.read(keep(alex, couple, iceland, ",\"book\":false"), "$.subjectId");
        assertThat(his).isNotEqualTo(keptId);
        String hisKept = fetch("/v1/journey/kept/" + his, alex);
        assertThat(JsonPath.<Object>read(hisKept, "$.pageId")).isNull();
        // None of the originals are his: everything is brought, at the size Journey has.
        assertThat(JsonPath.<Integer>read(hisKept, "$.originals.matched")).isZero();
        assertThat(JsonPath.<Integer>read(hisKept, "$.originals.brought")).isEqualTo(5);
        assertThat(wall(alex, couple, "?limit=50")).hasSize(5);
    }
}
