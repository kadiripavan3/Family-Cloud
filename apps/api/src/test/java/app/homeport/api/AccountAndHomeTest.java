package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** A person's own account, their uploads, and what Home gathers for them. */
class AccountAndHomeTest extends ApiTest {

    @Test
    void aProfileNeedsANameAndBeingThirteenAndNothingElseWorksBeforeIt() throws Exception {
        String token = signIn("new@example.com");

        assertThat(JsonPath.<Object>read(fetch("/v1/me", token), "$.profile")).isNull();
        send(HttpMethod.GET, "/v1/circles", token, null, 409);
        send(HttpMethod.PUT, "/v1/me/profile", token, "{\"displayName\":\"New\"}", 400);
        send(HttpMethod.PUT, "/v1/me/profile", token, "{\"displayName\":\" \",\"ageConfirmed\":true}", 400);
        send(HttpMethod.PUT, "/v1/me/profile", token, "{\"displayName\":\"New Person\",\"ageConfirmed\":true}", 200);

        assertThat(JsonPath.<String>read(fetch("/v1/me", token), "$.profile.displayName"))
                .isEqualTo("New Person");
        assertThat(fetch("/v1/circles", token)).isEqualTo("[]");
    }

    @Test
    void settingsKeepWhatIsLeftOut() throws Exception {
        String nora = person("Nora");
        assertThat(JsonPath.<Boolean>read(fetch("/v1/me/settings", nora), "$.summaryEmail"))
                .isFalse();

        send(HttpMethod.PUT, "/v1/me/settings", nora, "{\"summaryEmail\":true}", 200);
        send(HttpMethod.PUT, "/v1/me/settings", nora, "{\"notifyActivity\":false}", 200);

        String settings = fetch("/v1/me/settings", nora);
        assertThat(JsonPath.<Boolean>read(settings, "$.summaryEmail")).isTrue();
        assertThat(JsonPath.<Boolean>read(settings, "$.notifyActivity")).isFalse();
        assertThat(JsonPath.<Boolean>read(settings, "$.weeklySummary")).isTrue();
    }

    @Test
    void theYouScreenCountsCirclesNotesAndWhatIsKept() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String linds = circle(nora, "family", "The Linds");
        circle(nora, "crew", "Lisbon crew");
        join(nora, linds, alex);
        page(nora, linds, "One", "me");
        page(nora, linds, "Two", "circle");
        page(alex, linds, "Alex's", "circle");
        uploadPhoto(nora);

        String overview = fetch("/v1/me/overview", nora);

        assertThat(JsonPath.<List<String>>read(overview, "$.circles")).containsExactly("The Linds", "Lisbon crew");
        assertThat(JsonPath.<Integer>read(overview, "$.notes")).isEqualTo(2);
        assertThat(JsonPath.<Integer>read(overview, "$.bytesKept")).isPositive();
        assertThat(JsonPath.<List<String>>read(overview, "$.phones")).isEmpty();
    }

    @Test
    void deletingAnAccountTakesWhatWasTheirsAndLeavesTheCircleToTheOthers() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String shared = circle(nora, "family", "The Linds");
        join(nora, shared, alex);
        String alone = circle(nora, "solo", "Just me");
        String hers = page(nora, shared, "Hers", "circle");
        String his = page(alex, shared, "His", "circle");
        page(nora, alone, "Diary", "me");
        uploadPhoto(nora);

        send(HttpMethod.DELETE, "/v1/me", nora, null, 204);

        // Her own circle is gone; the shared one stays, with Alex as its owner and without her things.
        assertThat(jdbc.sql("select count(*) from circles where id = cast(:id as uuid)")
                        .param("id", alone)
                        .query(Integer.class)
                        .single())
                .isZero();
        String left = fetch("/v1/circles/" + shared, alex);
        assertThat(JsonPath.<String>read(left, "$.myRole")).isEqualTo("owner");
        assertThat(JsonPath.<List<String>>read(left, "$.members[*].name")).containsExactly("Alex");
        send(HttpMethod.GET, "/v1/pages/" + hers, alex, null, 404);
        send(HttpMethod.GET, "/v1/pages/" + his, alex, null, 200);
        assertThat(jdbc.sql("select count(*) from media").query(Integer.class).single())
                .isZero();
        assertThat(jdbc.sql("select count(*) from removed_files")
                        .query(Integer.class)
                        .single())
                .isPositive();
        // Her token is still good for a while, and gets the same answer everywhere.
        send(HttpMethod.GET, "/v1/me", nora, null, 401);
        send(HttpMethod.PUT, "/v1/me/profile", nora, "{\"displayName\":\"Back\",\"ageConfirmed\":true}", 401);
    }

    @Test
    void anUploadIsOnlyUsableOnceItIsCompleteAndOnlyByWhoeverSentIt() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String target = startPhoto(nora, "image/jpeg");
        String id = JsonPath.read(target, "$.mediaId");

        // Not sent yet: can't be completed, can't be used.
        send(HttpMethod.POST, "/v1/media/uploads/" + id + "/complete", nora, null, 400);
        send(
                HttpMethod.PUT,
                "/v1/me/profile",
                nora,
                "{\"displayName\":\"Nora\",\"avatarMediaId\":\"%s\"}".formatted(id),
                400);

        send(
                target,
                "image/jpeg",
                jpeg(new java.awt.image.BufferedImage(40, 30, java.awt.image.BufferedImage.TYPE_INT_RGB)));
        send(HttpMethod.POST, "/v1/media/uploads/" + id + "/complete", alex, null, 400);
        send(HttpMethod.POST, "/v1/media/uploads/" + id + "/complete", nora, null, 204);
        send(HttpMethod.POST, "/v1/media/uploads/" + id + "/complete", nora, null, 204);

        send(
                HttpMethod.PUT,
                "/v1/me/profile",
                alex,
                "{\"displayName\":\"Alex\",\"avatarMediaId\":\"%s\"}".formatted(id),
                400);
        send(
                HttpMethod.PUT,
                "/v1/me/profile",
                nora,
                "{\"displayName\":\"Nora\",\"avatarMediaId\":\"%s\"}".formatted(id),
                200);
    }

    @Test
    void aDocumentARecordingAndAVideoAreKeptAsTheyArriveAndOtherFilesAreRefused() throws Exception {
        String nora = person("Nora");
        for (String[] file : new String[][] {
            {"file", "application/pdf"}, {"audio", "audio/mp4"}, {"video", "video/mp4"}, {"file", "image/png"}
        }) {
            String target = send(
                    HttpMethod.POST,
                    "/v1/media/uploads",
                    nora,
                    "{\"kind\":\"%s\",\"contentType\":\"%s\",\"fileName\":\"../../School report.pdf\"}"
                            .formatted(file[0], file[1]),
                    200);
            send(target, file[1], "not really a file, and that is fine: it is kept as it arrives".getBytes());
            send(
                    HttpMethod.POST,
                    "/v1/media/uploads/" + JsonPath.<String>read(target, "$.mediaId") + "/complete",
                    nora,
                    null,
                    204);
        }
        assertThat(jdbc.sql(
                                "select count(*) from media where status = 'ready' and file_name = '.. .. School report.pdf'")
                        .query(Integer.class)
                        .single())
                .isEqualTo(4);

        send(
                HttpMethod.POST,
                "/v1/media/uploads",
                nora,
                "{\"kind\":\"file\",\"contentType\":\"application/x-msdownload\"}",
                400);
        send(
                HttpMethod.POST,
                "/v1/media/uploads",
                nora,
                "{\"kind\":\"photo\",\"contentType\":\"application/pdf\"}",
                400);
        send(HttpMethod.POST, "/v1/media/uploads", nora, "{\"kind\":\"movie\",\"contentType\":\"video/mp4\"}", 400);
    }

    @Test
    void homeShowsWhatOthersSharedLatelyAndCountsWhatIsOnlyYours() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        page(nora, circle, "Gift list", "me");
        String fromAlex = page(alex, circle, "Emergency numbers", "circle");
        page(alex, circle, "Alex's own", "me");

        String today = fetch("/v1/circles/" + circle + "/today?day=2026-11-11", nora);

        assertThat(JsonPath.<String>read(today, "$.day")).isEqualTo("2026-11-11");
        assertThat(JsonPath.<List<String>>read(today, "$.fresh[*].thingId")).containsExactly(fromAlex);
        assertThat(JsonPath.<String>read(today, "$.fresh[0].note")).isEqualTo("Alex shared a page");
        assertThat(JsonPath.<Integer>read(today, "$.onlyYou")).isEqualTo(1);
    }

    @Test
    void searchFindsTitlesAndWordsInsideAndAPersonsPageGathersWhatIsKeptForThem() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String mia = addMember(nora, circle, "Mia", "child");
        String page = page(nora, circle, "What to bring to Norway", "circle");
        send(
                HttpMethod.PATCH,
                "/v1/pages/" + page,
                nora,
                "{\"body\":\"Tickets, chargers, all four passports and the 100% wool socks.\"}",
                200);
        jdbc.sql("insert into thing_about (thing_id, member_id) values (cast(:thing as uuid), cast(:member as uuid))")
                .param("thing", page)
                .param("member", mia)
                .update();

        String inside = search(circle, nora, "passports", null);
        assertThat(JsonPath.<String>read(inside, "$.hits[0].thing.title")).isEqualTo("What to bring to Norway");
        assertThat(JsonPath.<String>read(inside, "$.hits[0].snippet")).contains("all four passports");
        assertThat(JsonPath.<Integer>read(search(circle, nora, "norway", null), "$.hits.length()"))
                .isEqualTo(1);
        // What someone types is matched as it is: a percent sign is a percent sign.
        assertThat(JsonPath.<Integer>read(search(circle, nora, "100% wool", null), "$.hits.length()"))
                .isEqualTo(1);
        assertThat(JsonPath.<Integer>read(search(circle, nora, "%%", null), "$.hits.length()"))
                .isZero();
        assertThat(JsonPath.<Integer>read(search(circle, nora, "p", null), "$.hits.length()"))
                .isZero();
        assertThat(JsonPath.<Integer>read(search(circle, nora, "norway", "vault"), "$.hits.length()"))
                .isZero();

        assertThat(JsonPath.<List<String>>read(fetch("/v1/members/" + mia, nora), "$.kept[*].title"))
                .containsExactly("What to bring to Norway");
    }

    @Test
    void aListOfPagesComesInPagesThatNeitherRepeatNorSkip() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "crew", "Lisbon crew");
        for (int i = 0; i < 7; i++) {
            page(nora, circle, "Page " + i, null);
        }
        java.util.Set<String> seen = new java.util.LinkedHashSet<>();
        String cursor = null;
        do {
            String part = fetch(
                    "/v1/circles/" + circle + "/pages?limit=3" + (cursor == null ? "" : "&cursor=" + cursor), nora);
            List<String> ids = JsonPath.read(part, "$.items[*].id");
            assertThat(seen).doesNotContainAnyElementsOf(ids);
            seen.addAll(ids);
            cursor = JsonPath.read(part, "$.nextCursor");
        } while (cursor != null);
        assertThat(seen).hasSize(7);
        send(HttpMethod.GET, "/v1/circles/" + circle + "/pages?cursor=nonsense", nora, null, 400);
    }

    /** Searches with the words passed as they are, so a percent sign in them is a percent sign. */
    private String search(String circle, String token, String words, String place) throws Exception {
        var request = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(
                        "/v1/circles/" + circle + "/search")
                .param("q", words)
                .header("Authorization", token);
        if (place != null) {
            request = request.param("place", place);
        }
        return mvc.perform(request).andReturn().getResponse().getContentAsString();
    }
}
