package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import app.homeport.api.journey.JourneyVisibility;
import app.homeport.api.journey.LocalJourney.Doc;
import app.homeport.api.journey.LocalJourney.DocEntry;
import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Tell it as a journey: a draft from the Library, sorted into days; the check before it leaves home; and
 * what arrives in Journey when it is sent, which is what the check let through and nothing else.
 */
class TellJourneyTest extends JourneyApiTest {

    private static final String AT_THE_LAKE =
            ",\"lat\":46.3625,\"lng\":14.0938,\"placeName\":\"Lake Bled\",\"country\":\"Slovenia\"";
    private static final String AT_HOME =
            ",\"lat\":46.0570,\"lng\":14.5059,\"placeName\":\"Home\",\"country\":\"Slovenia\"";
    private static final String FOR_ALL = ",\"audience\":\"circle\"";

    private String nora;
    private String alex;
    private String circle;
    private String mia;
    private String onlyHers;
    private String ofMia;
    private String alexs;
    private String surprise;
    private String clip;
    private String homeVideo;
    private String sunday;
    private String kitchen;

    /**
     * A weekend at the lake in The Linds' Library: Saturday from two phones, with a photo of Mia, one that is a
     * surprise for Alex, a clip and a long video; Sunday with a photo by the water and one back in the kitchen.
     */
    private void theWeekend() throws Exception {
        nora = person("Nora");
        alex = person("Alex");
        circle = circle(nora, "family", "The Linds");
        String alexMember = join(nora, circle, alex);
        mia = addMember(nora, circle, "Mia", "child");
        // The dog has no sign-in either, and is nobody's child: a photo of him is not left out with the children's.
        String biscuit = addMember(nora, circle, "Biscuit", "pet");
        onJourney(nora, "nora");
        send(
                HttpMethod.PUT,
                "/v1/circles/" + circle + "/journey/settings",
                nora,
                "{\"homeLat\":46.0569,\"homeLng\":14.5058}",
                200);

        onlyHers = photo(nora, circle, "2026-11-07T11:42:00+01:00", AT_THE_LAKE);
        ofMia = photo(
                nora, circle, "2026-11-07T11:30:00+01:00", AT_THE_LAKE + FOR_ALL + ",\"about\":[\"" + mia + "\"]");
        alexs = photo(alex, circle, "2026-11-07T11:20:00+01:00", AT_THE_LAKE + FOR_ALL);
        surprise = photo(nora, circle, "2026-11-07T11:10:00+01:00", AT_THE_LAKE + FOR_ALL);
        shareWith(
                nora,
                surprise,
                "{\"audience\":\"circle\",\"hiddenFrom\":[{\"memberId\":\"%s\"}]}".formatted(alexMember));
        clip = video(nora, circle, "2026-11-07T11:00:00+01:00", AT_THE_LAKE + FOR_ALL);
        String long90 = sendFile(nora, "video", "video/mp4", "ninety seconds".getBytes(), ",\"durationSeconds\":90");
        homeVideo = JsonPath.read(
                addOne(nora, circle, long90, ",\"takenAt\":\"2026-11-07T10:50:00+01:00\"" + AT_THE_LAKE + FOR_ALL),
                "$.items[0].item.id");
        sunday = photo(
                nora, circle, "2026-11-08T09:00:00+01:00", AT_THE_LAKE + FOR_ALL + ",\"about\":[\"" + biscuit + "\"]");
        kitchen = photo(nora, circle, "2026-11-08T18:00:00+01:00", AT_HOME + FOR_ALL);
        // Thursday is two days before: Friday has nothing, so Thursday is not part of the weekend.
        photo(nora, circle, "2026-11-05T19:00:00+01:00", AT_HOME + FOR_ALL);
    }

    private String draftFrom(String token, String what, String id) throws Exception {
        return send(
                HttpMethod.POST,
                "/v1/journey/drafts",
                token,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"%s\":\"%s\"}".formatted(id(), circle, what, id),
                201);
    }

    private String post(String token, String draftId) throws Exception {
        return finished(
                token,
                send(
                        HttpMethod.POST,
                        "/v1/journey/drafts/" + draftId + "/post",
                        token,
                        "{\"clientId\":\"%s\"}".formatted(id()),
                        201));
    }

    @Test
    void aMomentBecomesADraftSortedIntoDaysWithATitleAndAFirstLineForEachDay() throws Exception {
        theWeekend();

        String body = "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"momentOf\":\"%s\"}".formatted(id(), circle, onlyHers);
        String draft = send(HttpMethod.POST, "/v1/journey/drafts", nora, body, 201);
        String draftId = JsonPath.read(draft, "$.id");
        // Sent twice, it is one draft.
        assertThat(JsonPath.<String>read(send(HttpMethod.POST, "/v1/journey/drafts", nora, body, 201), "$.id"))
                .isEqualTo(draftId);

        assertThat(JsonPath.<String>read(draft, "$.title")).isEqualTo("A weekend at Lake Bled");
        assertThat(JsonPath.<String>read(draft, "$.from.kind")).isEqualTo("moment");
        assertThat(JsonPath.<String>read(draft, "$.from.title")).isEqualTo("Saturday at Lake Bled");
        assertThat(JsonPath.<Integer>read(draft, "$.from.daysAround")).isEqualTo(1);
        assertThat(JsonPath.<String>read(draft, "$.from.coverUrl")).isNotBlank();
        assertThat(JsonPath.<String>read(draft, "$.status")).isEqualTo("draft");
        assertThat(JsonPath.<String>read(draft, "$.visibility"))
                .as("it starts as private")
                .isEqualTo("private");
        assertThat(JsonPath.<List<String>>read(draft, "$.days[*].day")).containsExactly("2026-11-07", "2026-11-08");
        assertThat(JsonPath.<List<Integer>>read(draft, "$.days[*].number")).containsExactly(1, 2);
        assertThat(JsonPath.<List<String>>read(draft, "$.days[*].line"))
                .containsExactly("Saturday at Lake Bled", "Sunday at Lake Bled");
        assertThat(JsonPath.<List<Integer>>read(draft, "$.days[*].photos")).containsExactly(4, 2);
        assertThat(JsonPath.<List<Integer>>read(draft, "$.days[*].clips")).containsExactly(2, 0);
        // In the order they were taken.
        assertThat(JsonPath.<List<String>>read(draft, "$.days[0].items[*].itemId"))
                .containsExactly(homeVideo, clip, surprise, alexs, ofMia, onlyHers);
        assertThat(JsonPath.<Integer>read(draft, "$.photos")).isEqualTo(6);
        assertThat(JsonPath.<Integer>read(draft, "$.clips")).isEqualTo(2);
        // Nothing has been sent: Journey has no journey of hers.
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/journey/journeys", nora), "$.items"))
                .isEmpty();

        // Fixing it: a title of her own, other words for Sunday, a photo moved, one dropped.
        String changed = send(
                HttpMethod.PATCH,
                "/v1/journey/drafts/" + draftId,
                nora,
                ("{\"title\":\"Bled, the long way round\",\"days\":[{\"day\":\"2026-11-08\",\"line\":\"The walk back\"}],"
                                + "\"move\":[{\"itemId\":\"%s\",\"day\":\"2026-11-07\"}],\"drop\":[\"%s\"]}")
                        .formatted(sunday, alexs),
                200);
        assertThat(JsonPath.<String>read(changed, "$.title")).isEqualTo("Bled, the long way round");
        assertThat(JsonPath.<List<String>>read(changed, "$.days[*].line"))
                .containsExactly("Saturday at Lake Bled", "The walk back");
        assertThat(JsonPath.<List<Integer>>read(changed, "$.days[*].photos")).containsExactly(4, 1);
        assertThat(JsonPath.<List<Boolean>>read(changed, "$.days[0].items[?(@.itemId == '" + alexs + "')].dropped"))
                .containsExactly(true);
        assertThat(JsonPath.<List<String>>read(changed, "$.days[0].items[*].itemId"))
                .endsWith(sunday);
        send(HttpMethod.PATCH, "/v1/journey/drafts/" + draftId, nora, "{\"restore\":[\"%s\"]}".formatted(alexs), 200);
        send(HttpMethod.PATCH, "/v1/journey/drafts/" + draftId, nora, "{\"title\":\" \"}", 400);
        send(
                HttpMethod.PATCH,
                "/v1/journey/drafts/" + draftId,
                nora,
                "{\"move\":[{\"itemId\":\"%s\",\"day\":\"2026-11-07\"}]}".formatted(UUID.randomUUID()),
                400);

        // A draft is its writer's alone: Alex, in the same circle, finds nothing under its id.
        assertThat(status("/v1/journey/drafts/" + draftId, alex)).isEqualTo(404);
        assertThat(status("/v1/journey/drafts/" + draftId + "/check", alex)).isEqualTo(404);
        send(HttpMethod.PATCH, "/v1/journey/drafts/" + draftId, alex, "{\"title\":\"His\"}", 404);
        send(HttpMethod.PUT, "/v1/journey/drafts/" + draftId + "/check", alex, "{\"skipHome\":false}", 404);
        send(
                HttpMethod.POST,
                "/v1/journey/drafts/" + draftId + "/post",
                alex,
                "{\"clientId\":\"%s\"}".formatted(id()),
                404);
        send(HttpMethod.DELETE, "/v1/journey/drafts/" + draftId, alex, null, 404);
        // Thrown away, it is gone, and nothing of it ever left.
        send(HttpMethod.DELETE, "/v1/journey/drafts/" + draftId, nora, null, 204);
        assertThat(status("/v1/journey/drafts/" + draftId, nora)).isEqualTo(404);
    }

    @Test
    void beforeItLeavesHomeChildrenHomeAndLongVideosStayAndWhatIsPrivateIsPointedOut() throws Exception {
        theWeekend();
        String draftId = JsonPath.read(draftFrom(nora, "momentOf", onlyHers), "$.id");

        String check = fetch("/v1/journey/drafts/" + draftId + "/check", nora);
        assertThat(JsonPath.<Boolean>read(check, "$.children.on")).isTrue();
        assertThat(JsonPath.<Integer>read(check, "$.children.count")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(check, "$.children.of")).isEqualTo(8);
        assertThat(JsonPath.<List<String>>read(check, "$.children.names")).containsExactly("Mia");
        assertThat(JsonPath.<Boolean>read(check, "$.town.on")).isTrue();
        assertThat(JsonPath.<String>read(check, "$.town.shows")).isEqualTo("Lake Bled");
        assertThat(JsonPath.<Boolean>read(check, "$.home.on")).isTrue();
        assertThat(JsonPath.<Integer>read(check, "$.home.count")).isEqualTo(1);
        assertThat(JsonPath.<Boolean>read(check, "$.home.homeKnown")).isTrue();
        assertThat(JsonPath.<Boolean>read(check, "$.onlyPhotosAndVideos")).isTrue();
        assertThat(JsonPath.<Integer>read(check, "$.tooLong")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(check, "$.photosGoing")).isEqualTo(4);
        assertThat(JsonPath.<Integer>read(check, "$.clipsGoing")).isEqualTo(1);
        assertThat(JsonPath.<String>read(check, "$.visibility")).isEqualTo("private");
        assertThat(JsonPath.<List<Integer>>read(check, "$.flags[?(@.flag == 'only_you')].count"))
                .containsExactly(1);
        assertThat(JsonPath.<List<Integer>>read(check, "$.flags[?(@.flag == 'hidden')].count"))
                .containsExactly(1);
        assertThat(JsonPath.<List<Integer>>read(check, "$.flags[?(@.flag == 'someone_elses')].count"))
                .containsExactly(1);
        assertThat(JsonPath.<List<List<String>>>read(check, "$.items[?(@.itemId == '" + ofMia + "')].leftOut"))
                .containsExactly(List.of("child"));
        assertThat(JsonPath.<List<List<String>>>read(check, "$.items[?(@.itemId == '" + kitchen + "')].leftOut"))
                .containsExactly(List.of("home"));
        assertThat(JsonPath.<List<List<String>>>read(check, "$.items[?(@.itemId == '" + homeVideo + "')].leftOut"))
                .containsExactly(List.of("too_long"));
        assertThat(JsonPath.<List<Boolean>>read(check, "$.items[?(@.itemId == '" + surprise + "')].goes"))
                .as("a flag leaves nothing out")
                .containsExactly(true);

        // One by one: Mia's photo goes after all. Then the whole switch for home is turned off, and on again.
        String one = send(
                HttpMethod.PUT,
                "/v1/journey/drafts/" + draftId + "/check",
                nora,
                "{\"backOn\":[\"%s\",\"%s\"]}".formatted(ofMia, homeVideo),
                200);
        assertThat(JsonPath.<Integer>read(one, "$.photosGoing")).isEqualTo(5);
        assertThat(JsonPath.<Integer>read(one, "$.clipsGoing"))
                .as("no switch sends a video Journey doesn't take")
                .isEqualTo(1);
        String all = send(
                HttpMethod.PUT,
                "/v1/journey/drafts/" + draftId + "/check",
                nora,
                "{\"skipHome\":false,\"visibility\":\"unlisted\"}",
                200);
        assertThat(JsonPath.<Integer>read(all, "$.photosGoing")).isEqualTo(6);
        assertThat(JsonPath.<Boolean>read(all, "$.home.on")).isFalse();
        assertThat(JsonPath.<String>read(all, "$.visibility")).isEqualTo("unlisted");
        String back = send(
                HttpMethod.PUT,
                "/v1/journey/drafts/" + draftId + "/check",
                nora,
                "{\"skipHome\":true,\"backOff\":[\"%s\"],\"visibility\":\"private\"}".formatted(ofMia),
                200);
        assertThat(JsonPath.<Integer>read(back, "$.photosGoing")).isEqualTo(4);
        send(HttpMethod.PUT, "/v1/journey/drafts/" + draftId + "/check", nora, "{\"visibility\":\"everyone\"}", 400);

        // A circle that never said where home is: the screen is told nothing can be recognised as taken there.
        String kai = person("Kai");
        String flat = circle(kai, "flat", "Trubarjeva 9");
        String theirs = photo(kai, flat, "2026-11-07T11:42:00+01:00", AT_HOME);
        String flatDraft = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/journey/drafts",
                        kai,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"momentOf\":\"%s\"}".formatted(id(), flat, theirs),
                        201),
                "$.id");
        String flatCheck = fetch("/v1/journey/drafts/" + flatDraft + "/check", kai);
        assertThat(JsonPath.<Boolean>read(flatCheck, "$.home.homeKnown")).isFalse();
        assertThat(JsonPath.<Integer>read(flatCheck, "$.home.count")).isZero();
        assertThat(JsonPath.<Integer>read(flatCheck, "$.photosGoing")).isEqualTo(1);
    }

    @Test
    void whatArrivesInJourneyIsWhatTheCheckLetThroughAndADraftLeavesOnce() throws Exception {
        theWeekend();
        String draftId = JsonPath.read(draftFrom(nora, "momentOf", onlyHers), "$.id");

        String job = post(nora, draftId);
        assertThat(JsonPath.<String>read(job, "$.status")).as(job).isEqualTo("done");
        assertThat(JsonPath.<String>read(job, "$.kind")).isEqualTo("post");
        assertThat(JsonPath.<Integer>read(job, "$.total")).isEqualTo(5);

        String sent = fetch("/v1/journey/drafts/" + draftId, nora);
        assertThat(JsonPath.<String>read(sent, "$.status")).isEqualTo("posted");
        String journeyId = JsonPath.read(sent, "$.journeyId");
        assertThat(JsonPath.<String>read(sent, "$.openUrl")).isEqualTo("journey://journey/" + journeyId);

        // In Journey: one private journey, two days, five photos and clips. Mia's photo, the kitchen and the long
        // video never arrived.
        Doc told = journey.doc(UUID.fromString(journeyId)).orElseThrow();
        assertThat(told.title()).isEqualTo("A weekend at Lake Bled");
        assertThat(told.visibility()).isEqualTo(JourneyVisibility.PRIVATE);
        assertThat(told.startDate()).isEqualTo(LocalDate.of(2026, 11, 7));
        assertThat(told.entries())
                .extracting(DocEntry::happenedOn)
                .containsExactly(LocalDate.of(2026, 11, 7), LocalDate.of(2026, 11, 8));
        assertThat(told.entries()).extracting(entry -> entry.shots().size()).containsExactly(4, 1);
        assertThat(told.entries())
                .extracting(DocEntry::body)
                .containsExactly("Saturday at Lake Bled", "Sunday at Lake Bled");
        // The town, not the spot.
        assertThat(told.entries().get(0).place()).isEqualTo("Lake Bled");
        assertThat(told.entries().get(0).lat()).isEqualTo(46.36);
        assertThat(told.entries().get(0).lng()).isEqualTo(14.09);
        assertThat(JsonPath.<List<String>>read(fetch("/v1/journey/journeys", nora), "$.items[*].title"))
                .containsExactly("A weekend at Lake Bled");

        // It left. It can't leave again, be changed here, or be sent by asking twice.
        send(
                HttpMethod.POST,
                "/v1/journey/drafts/" + draftId + "/post",
                nora,
                "{\"clientId\":\"%s\"}".formatted(id()),
                409);
        send(HttpMethod.PATCH, "/v1/journey/drafts/" + draftId, nora, "{\"title\":\"Again\"}", 409);
        send(HttpMethod.PUT, "/v1/journey/drafts/" + draftId + "/check", nora, "{\"skipHome\":false}", 409);
        assertThat(jdbc.sql("select count(*) from local_journeys")
                        .query(Integer.class)
                        .single())
                .isEqualTo(1);
    }

    @Test
    void anAlbumBecomesADraftOfItsPhotosAndSomeoneWithoutAJourneyProfileIsToldToOpenJourneyFirst() throws Exception {
        theWeekend();
        // Alex's album: his photo from the lake and a scan. Only the photo can be told.
        String scan = document(alex, circle, "Ferry booking", "Booking 4471", FOR_ALL);
        String album =
                album(alex, circle, "For the grandparents", ",\"itemIds\":%s".formatted(list(alexs, sunday, scan)));
        String draft = draftFrom(alex, "albumId", album);
        String draftId = JsonPath.read(draft, "$.id");
        assertThat(JsonPath.<String>read(draft, "$.from.kind")).isEqualTo("album");
        assertThat(JsonPath.<String>read(draft, "$.from.title")).isEqualTo("For the grandparents");
        assertThat(JsonPath.<List<String>>read(draft, "$.days[*].items[*].itemId"))
                .containsExactly(alexs, sunday);
        // Nora's photo in his draft is flagged as someone else's; his own is not.
        String check = fetch("/v1/journey/drafts/" + draftId + "/check", alex);
        assertThat(JsonPath.<List<List<String>>>read(check, "$.items[?(@.itemId == '" + sunday + "')].flags"))
                .containsExactly(List.of("someone_elses"));

        // He never opened Journey: sending says so, and the draft waits.
        String failed = post(alex, draftId);
        assertThat(JsonPath.<String>read(failed, "$.status")).isEqualTo("failed");
        assertThat(JsonPath.<String>read(failed, "$.problem"))
                .isEqualTo("Open Journey once first, so there is somewhere to tell it.");
        assertThat(JsonPath.<String>read(fetch("/v1/journey/drafts/" + draftId, alex), "$.status"))
                .isEqualTo("failed");
        onJourney(alex, "alex");
        assertThat(JsonPath.<String>read(post(alex, draftId), "$.status")).isEqualTo("done");
        assertThat(JsonPath.<String>read(fetch("/v1/journey/drafts/" + draftId, alex), "$.job.status"))
                .isEqualTo("done");

        // A draft needs one thing to start from, something of this circle that its writer may see, with photos in it.
        String ask = "{\"clientId\":\"%s\",\"circleId\":\"%s\"%s}";
        send(HttpMethod.POST, "/v1/journey/drafts", nora, ask.formatted(id(), circle, ""), 400);
        send(
                HttpMethod.POST,
                "/v1/journey/drafts",
                nora,
                ask.formatted(id(), circle, ",\"momentOf\":\"%s\",\"albumId\":\"%s\"".formatted(onlyHers, album)),
                400);
        send(
                HttpMethod.POST,
                "/v1/journey/drafts",
                alex,
                ask.formatted(id(), circle, ",\"momentOf\":\"%s\"".formatted(onlyHers)),
                404);
        send(
                HttpMethod.POST,
                "/v1/journey/drafts",
                alex,
                ask.formatted(id(), circle, ",\"momentOf\":\"%s\"".formatted(scan)),
                404);
        String empty = album(nora, circle, "Nothing yet", "");
        send(
                HttpMethod.POST,
                "/v1/journey/drafts",
                nora,
                ask.formatted(id(), circle, ",\"albumId\":\"%s\"".formatted(empty)),
                400);
        // A draft where nothing is going can't be sent.
        String onlyMia = album(nora, circle, "Mia", ",\"itemIds\":%s".formatted(list(ofMia)));
        String miaDraft = JsonPath.read(draftFrom(nora, "albumId", onlyMia), "$.id");
        send(
                HttpMethod.POST,
                "/v1/journey/drafts/" + miaDraft + "/post",
                nora,
                "{\"clientId\":\"%s\"}".formatted(id()),
                400);
    }
}
