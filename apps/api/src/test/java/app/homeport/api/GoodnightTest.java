package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Goodnight from far away: a clip for the circle from someone who is away. It waits on Today for bedtime, it
 * can be loved and answered, it is shared like any other thing, and it never goes to Journey.
 */
class GoodnightTest extends JourneyApiTest {

    private static final String TODAY = "2026-11-11";

    private String nora;
    private String alex;
    private String lea;
    private String circle;
    private String leo;
    private String noraMember;
    private String leaMember;

    private void theLinds() throws Exception {
        nora = person("Nora");
        alex = person("Alex");
        lea = person("Lea");
        circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        leaMember = join(nora, circle, lea);
        leo = addMember(nora, circle, "Leo", "child");
        noraMember = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
    }

    private String clip(String token, int seconds) throws Exception {
        return sendFile(token, "video", "video/mp4", ("a clip " + id()).getBytes(), ",\"durationSeconds\":" + seconds);
    }

    /** Alex records a goodnight in Reine, for tonight at home. Returns the answer. */
    private String fromReine(String more) throws Exception {
        return send(
                HttpMethod.POST,
                "/v1/goodnights",
                alex,
                ("{\"clientId\":\"%s\",\"circleId\":\"%s\",\"mediaId\":\"%s\",\"posterMediaId\":\"%s\","
                                + "\"title\":\"Goodnight, you two\",\"recordedAt\":\"2026-11-11T19:10:00+01:00\","
                                + "\"place\":\"Reine, Norway\",\"dayLabel\":\"Day 6\"%s}")
                        .formatted(
                                id(),
                                circle,
                                clip(alex, 48),
                                sendFile(alex, "photo", "image/jpeg", picture(), ""),
                                more),
                201);
    }

    private List<String> cards(String token) throws Exception {
        return JsonPath.read(
                fetch("/v1/circles/" + circle + "/today?day=" + TODAY, token),
                "$.cards[?(@.look == 'goodnight')].title");
    }

    private List<String> listed(String token) throws Exception {
        return JsonPath.read(fetch("/v1/circles/" + circle + "/goodnights", token), "$.items[*].id");
    }

    @Test
    void aGoodnightWaitsOnTodayForBedtimeAndCanBeLovedAndAnswered() throws Exception {
        theLinds();
        String sent = fromReine("");
        String id = JsonPath.read(sent, "$.id");

        // What its screen shows.
        String night = fetch("/v1/goodnights/" + id, nora);
        assertThat(JsonPath.<String>read(night, "$.title")).isEqualTo("Goodnight, you two");
        assertThat(JsonPath.<String>read(night, "$.from.name")).isEqualTo("Alex");
        assertThat(JsonPath.<String>read(night, "$.circleName")).isEqualTo("The Linds");
        assertThat(JsonPath.<String>read(night, "$.place")).isEqualTo("Reine, Norway");
        assertThat(JsonPath.<String>read(night, "$.dayLabel")).isEqualTo("Day 6");
        assertThat(JsonPath.<String>read(night, "$.recordedLocal")).startsWith("2026-11-11T19:10");
        assertThat(JsonPath.<String>read(night, "$.forDay")).isEqualTo(TODAY);
        assertThat(JsonPath.<String>read(night, "$.showFrom")).startsWith("20:00");
        assertThat(JsonPath.<Integer>read(night, "$.clip.durationSeconds")).isEqualTo(48);
        assertThat(JsonPath.<String>read(night, "$.clip.fileUrl")).contains("/videos/");
        assertThat(JsonPath.<String>read(night, "$.posterUrl")).isNotBlank();
        assertThat(JsonPath.<String>read(night, "$.chip.audience"))
                .as("it is for the circle")
                .isEqualTo("circle");
        assertThat(JsonPath.<Boolean>read(night, "$.mine")).isFalse();

        // At home it waits on Today, with the bedtime it waits for. Not for the one who sent it.
        String today = fetch("/v1/circles/" + circle + "/today?day=" + TODAY, nora);
        String card = "$.cards[?(@.look == 'goodnight')]";
        assertThat(JsonPath.<List<String>>read(today, card + ".title")).containsExactly("Goodnight from Alex");
        assertThat(JsonPath.<List<String>>read(today, card + ".line"))
                .containsExactly("For bedtime at 20:00 · Reine, Norway");
        assertThat(JsonPath.<List<String>>read(today, card + ".figure")).containsExactly("0:48");
        assertThat(JsonPath.<List<String>>read(today, card + ".thingId")).containsExactly(id);
        assertThat(JsonPath.<List<String>>read(today, card + ".kind")).containsExactly("goodnight");
        String home = fetch("/v1/circles/" + circle + "/journey/at-home?day=" + TODAY, nora);
        assertThat(JsonPath.<List<String>>read(home, "$.goodnights[*].id")).containsExactly(id);
        assertThat(JsonPath.<String>read(home, "$.bedtime")).startsWith("20:00");
        assertThat(cards(alex)).isEmpty();
        // The next day it has had its evening; it is still in the circle's goodnights.
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/circles/" + circle + "/today?day=2026-11-12", nora), card))
                .isEmpty();
        assertThat(listed(nora)).containsExactly(id);
        // Found by its words like anything else, with a few words on where it stands.
        String found = fetch("/v1/circles/" + circle + "/search?q=Goodnight", nora);
        assertThat(JsonPath.<List<String>>read(found, "$.hits[*].thing.id")).containsExactly(id);
        assertThat(JsonPath.<List<String>>read(found, "$.hits[*].thing.glance"))
                .containsExactly("0:48 · Reine, Norway");

        // Leo loved it: his mum gives the heart for him. Then her own, and she takes it back.
        send(HttpMethod.PUT, "/v1/goodnights/" + id + "/love?as=" + leo, nora, null, 200);
        String loved = send(HttpMethod.PUT, "/v1/goodnights/" + id + "/love", nora, null, 200);
        assertThat(JsonPath.<List<String>>read(loved, "$.lovedBy[*].name")).containsExactly("Leo", "Nora");
        assertThat(JsonPath.<Boolean>read(loved, "$.loved")).isTrue();
        String unloved = send(HttpMethod.DELETE, "/v1/goodnights/" + id + "/love", nora, null, 200);
        assertThat(JsonPath.<List<String>>read(unloved, "$.lovedBy[*].name")).containsExactly("Leo");
        send(HttpMethod.PUT, "/v1/goodnights/" + id + "/love?as=" + leaMember, nora, null, 403);

        // One is sent back. Alex finds it under his, and on his own Today.
        String back = send(
                HttpMethod.POST,
                "/v1/goodnights",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"mediaId\":\"%s\",\"replyTo\":\"%s\",\"forDay\":\"%s\"}"
                        .formatted(id(), circle, clip(nora, 9), id, TODAY),
                201);
        String backId = JsonPath.read(back, "$.id");
        assertThat(JsonPath.<String>read(back, "$.title")).isEqualTo("Goodnight");
        assertThat(JsonPath.<String>read(back, "$.replyTo")).isEqualTo(id);
        assertThat(JsonPath.<List<String>>read(fetch("/v1/goodnights/" + id, alex), "$.replies"))
                .containsExactly(backId);
        assertThat(cards(alex)).containsExactly("Goodnight from Nora");

        // The bedtime is the circle's own: the people who run it can move it, and say which clock home keeps.
        String settings = send(
                HttpMethod.PUT,
                "/v1/circles/" + circle + "/journey/settings",
                nora,
                "{\"bedtime\":\"19:30\",\"timeZone\":\"Europe/Ljubljana\"}",
                200);
        assertThat(JsonPath.<String>read(settings, "$.timeZone")).isEqualTo("Europe/Ljubljana");
        assertThat(JsonPath.<Boolean>read(settings, "$.canChange")).isTrue();
        assertThat(JsonPath.<String>read(fetch("/v1/goodnights/" + id, nora), "$.showFrom"))
                .startsWith("19:30");
        send(
                HttpMethod.PUT,
                "/v1/circles/" + circle + "/journey/settings",
                nora,
                "{\"timeZone\":\"Mars/Olympus\"}",
                400);
        send(HttpMethod.PUT, "/v1/circles/" + circle + "/journey/settings", nora, "{\"homeLat\":46.05}", 400);
        assertThat(status("/v1/circles/" + circle + "/journey/settings", person("Outsider")))
                .isEqualTo(404);
        // Recorded in Tokyo at two in the morning, it is for the evening before at home.
        String fromTokyo = send(
                HttpMethod.POST,
                "/v1/goodnights",
                alex,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"mediaId\":\"%s\",\"recordedAt\":\"2026-11-13T02:00:00+09:00\"}"
                        .formatted(id(), circle, clip(alex, 20)),
                201);
        assertThat(JsonPath.<String>read(fromTokyo, "$.forDay")).isEqualTo("2026-11-12");
        assertThat(JsonPath.<String>read(fromTokyo, "$.recordedLocal")).startsWith("2026-11-13T02:00");
    }

    @Test
    void sendingTheSameGoodnightTwiceMakesOneAndItNeedsAClipOfTheSendersOwn() throws Exception {
        theLinds();
        String media = clip(alex, 48);
        String body = "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"mediaId\":\"%s\"}".formatted(id(), circle, media);
        String first = JsonPath.read(send(HttpMethod.POST, "/v1/goodnights", alex, body, 201), "$.id");
        assertThat(JsonPath.<String>read(send(HttpMethod.POST, "/v1/goodnights", alex, body, 201), "$.id"))
                .isEqualTo(first);
        assertThat(listed(nora)).containsExactly(first);
        // The same clip can't be a second goodnight.
        send(
                HttpMethod.POST,
                "/v1/goodnights",
                alex,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"mediaId\":\"%s\"}".formatted(id(), circle, media),
                409);

        // A photo is not a clip; someone else's upload is not yours; a circle you aren't in isn't there.
        String ask = "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"mediaId\":\"%s\"}";
        send(
                HttpMethod.POST,
                "/v1/goodnights",
                alex,
                ask.formatted(id(), circle, sendFile(alex, "photo", "image/jpeg", picture(), "")),
                400);
        send(HttpMethod.POST, "/v1/goodnights", alex, ask.formatted(id(), circle, clip(nora, 5)), 400);
        String stranger = person("Stranger");
        send(HttpMethod.POST, "/v1/goodnights", stranger, ask.formatted(id(), circle, clip(stranger, 5)), 404);
        send(
                HttpMethod.POST,
                "/v1/goodnights",
                alex,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\"}".formatted(id(), circle),
                400);

        // Deleted by its sender (as every thing is), its clip goes with it.
        send(HttpMethod.DELETE, "/v1/things/" + first, nora, null, 403);
        send(HttpMethod.DELETE, "/v1/things/" + first, alex, null, 204);
        assertThat(listed(nora)).isEmpty();
        assertThat(jdbc.sql("select count(*) from media where id = cast(:id as uuid)")
                        .param("id", media)
                        .query(Integer.class)
                        .single())
                .isZero();
    }

    @Test
    void aGoodnightIsSharedLikeAnyOtherThing() throws Exception {
        theLinds();
        String id = JsonPath.read(fromReine(""), "$.id");
        String stranger = person("Stranger");

        // Nobody outside the circle learns of it, by any way in.
        assertThat(status("/v1/goodnights/" + id, stranger)).isEqualTo(404);
        assertThat(status("/v1/circles/" + circle + "/goodnights", stranger)).isEqualTo(404);
        assertThat(status("/v1/circles/" + circle + "/journey/at-home", stranger))
                .isEqualTo(404);
        send(HttpMethod.PUT, "/v1/goodnights/" + id + "/love", stranger, null, 404);
        send(HttpMethod.DELETE, "/v1/goodnights/" + id + "/love", stranger, null, 404);

        // Everyone in the circle sees it to begin with.
        for (String who : List.of(nora, lea)) {
            assertThat(status("/v1/goodnights/" + id, who)).isEqualTo(200);
            assertThat(listed(who)).containsExactly(id);
            assertThat(cards(who)).containsExactly("Goodnight from Alex");
        }

        // Alex makes it for Nora only, to look at. Lea is in the circle and it wasn't shared with her: to her it is
        // gone from every list, from Today, from the search, and under its id.
        shareWith(
                alex,
                id,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(noraMember));
        assertThat(status("/v1/goodnights/" + id, lea)).isEqualTo(404);
        assertThat(listed(lea)).isEmpty();
        assertThat(cards(lea)).isEmpty();
        assertThat(JsonPath.<List<Object>>read(
                        fetch("/v1/circles/" + circle + "/journey/at-home?day=" + TODAY, lea), "$.goodnights"))
                .isEmpty();
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/circles/" + circle + "/search?q=Goodnight", lea), "$.hits"))
                .isEmpty();
        send(HttpMethod.PUT, "/v1/goodnights/" + id + "/love", lea, null, 404);
        // She can't answer what she can't see.
        send(
                HttpMethod.POST,
                "/v1/goodnights",
                lea,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"mediaId\":\"%s\",\"replyTo\":\"%s\"}"
                        .formatted(id(), circle, clip(lea, 5), id),
                404);
        // Nora still sees it; she may look and love, and may not change who sees it or delete it.
        assertThat(status("/v1/goodnights/" + id, nora)).isEqualTo(200);
        assertThat(JsonPath.<Boolean>read(fetch("/v1/goodnights/" + id, nora), "$.canEdit"))
                .isFalse();
        send(HttpMethod.PUT, "/v1/goodnights/" + id + "/love", nora, null, 200);
        send(HttpMethod.PUT, "/v1/things/" + id + "/audience", nora, "{\"audience\":\"circle\"}", 403);
        send(HttpMethod.DELETE, "/v1/things/" + id, nora, null, 403);

        // Hidden from Nora for now, it is not there for her either.
        shareWith(alex, id, "{\"audience\":\"circle\",\"hiddenFrom\":[{\"memberId\":\"%s\"}]}".formatted(noraMember));
        assertThat(status("/v1/goodnights/" + id, nora)).isEqualTo(404);
        assertThat(listed(nora)).isEmpty();
        assertThat(cards(nora)).isEmpty();
        assertThat(listed(lea)).containsExactly(id);

        // A goodnight for the two of them, in their own circle, is nothing The Linds' other members can reach.
        String couple = circle(nora, "couple", "Nora and Alex");
        join(nora, couple, alex);
        String justUs = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/goodnights",
                        alex,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"mediaId\":\"%s\"}"
                                .formatted(id(), couple, clip(alex, 7)),
                        201),
                "$.id");
        assertThat(status("/v1/goodnights/" + justUs, lea)).isEqualTo(404);
        assertThat(listed(lea)).doesNotContain(justUs);
        // And an answer has to be in the circle of what it answers.
        send(
                HttpMethod.POST,
                "/v1/goodnights",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"mediaId\":\"%s\",\"replyTo\":\"%s\"}"
                        .formatted(id(), circle, clip(nora, 5), justUs),
                404);
    }

    @Test
    void aGoodnightNeverGoesToJourney() throws Exception {
        theLinds();
        onJourney(alex, "alex");
        onJourney(nora, "nora");
        String id = JsonPath.read(fromReine(",\"journeyId\":\"%s\"".formatted(java.util.UUID.randomUUID())), "$.id");
        send(HttpMethod.PUT, "/v1/goodnights/" + id + "/love", nora, null, 200);

        // Journey has nothing new: no journey, no entry, nothing of the clip.
        assertThat(jdbc.sql("select count(*) from local_journeys")
                        .query(Integer.class)
                        .single())
                .isZero();
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/journey/journeys", alex), "$.items"))
                .isEmpty();
        // And it is not something a journey can be told from: it is neither a photo nor a video of the Library.
        send(
                HttpMethod.POST,
                "/v1/journey/drafts",
                alex,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"momentOf\":\"%s\"}".formatted(id(), circle, id),
                404);
        assertThat(wall(nora, circle, "?limit=20")).isEmpty();
    }
}
