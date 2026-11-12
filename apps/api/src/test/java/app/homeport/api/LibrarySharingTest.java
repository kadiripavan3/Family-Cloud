package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * The one sharing rule, asked of the Library through every way a photo, a video, a document and an album can
 * be reached: by its id, on the wall and in each lens of it, in the counts at the side, in Files, in an
 * album, in search and on Today. They all have to give the same answer.
 */
class LibrarySharingTest extends LibraryApiTest {

    private static final String LAKE = ",\"placeName\":\"Lake Bled\",\"lat\":46.3625,\"lng\":14.0938";

    /** True when this person reaches the photo or video by any of the ways there are. All of them must agree. */
    private boolean seesShot(String token, String circle, String id, String album, String tagged) throws Exception {
        String base = "/v1/circles/" + circle;
        boolean byId = status("/v1/library/" + id, token) == 200;
        List<Boolean> ways = new ArrayList<>(List.of(
                byId,
                status("/v1/things/" + id, token) == 200,
                status("/v1/things/" + id + "/audience", token) == 200,
                status("/v1/library/" + id + "/moment", token) == 200,
                status("/v1/library/" + id + "/comments", token) == 200,
                wall(token, circle, "").contains(id),
                wall(token, circle, "?place=Lake Bled").contains(id),
                wall(token, circle, "?about=" + tagged).contains(id),
                wall(token, circle, "?album=" + album).contains(id),
                fetch(base + "/library", token).contains("\"id\":\"" + id + "\""), // as an item or as a moment
                fetch(base + "/library/timeline?year=2026", token).contains(id),
                fetch(base + "/library/places", token).contains("Lake Bled"),
                JsonPath.<Integer>read(fetch(base + "/library/lenses", token), "$.photos")
                                + JsonPath.<Integer>read(fetch(base + "/library/lenses", token), "$.videos")
                        > 0,
                !JsonPath.<List<Object>>read(fetch(base + "/library/lenses", token), "$.people")
                        .isEmpty(),
                JsonPath.<Integer>read(fetch("/v1/albums/" + album, token), "$.count") > 0,
                fetch("/v1/members/" + tagged, token).contains(id),
                fetch(base + "/search?q=Steering", token).contains(id)));
        assertThat(ways)
                .as("every way to reach the photo gives the same answer")
                .containsOnly(byId);
        return byId;
    }

    private boolean seesFile(String token, String circle, String id, String folder) throws Exception {
        String base = "/v1/circles/" + circle;
        boolean byId = status("/v1/documents/" + id, token) == 200;
        List<Boolean> ways = new ArrayList<>(List.of(
                byId,
                status("/v1/library/" + id, token) == 200,
                status("/v1/things/" + id, token) == 200,
                fetch(base + "/files?category=insurance", token).contains(id),
                fetch(base + "/files?q=HL-204", token).contains(id),
                fetch(base + "/files?q=insurance", token).contains(id),
                fetch(base + "/files?folder=" + folder, token).contains(id),
                JsonPath.<Integer>read(fetch(base + "/files/summary", token), "$.total") > 0,
                JsonPath.<Integer>read(fetch(base + "/files/summary", token), "$.folders[0].count") > 0,
                JsonPath.<Integer>read(fetch(base + "/library/lenses", token), "$.files") > 0,
                fetch(base + "/search?q=HL-204", token).contains(id),
                fetch(base + "/search?q=insurance", token).contains(id)));
        assertThat(ways)
                .as("every way to reach the document gives the same answer")
                .containsOnly(byId);
        return byId;
    }

    @Test
    void aPhotoAndAVideoAreReachedByNobodyTheyAreNotSharedWithWhicheverWayIsTried() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String stranger = person("Stranger");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String kaiId = join(nora, circle, kai);
        String mia = addMember(nora, circle, "Mia", "child");
        // The album and the tag are for everyone, so only the photo itself decides.
        String album = album(nora, circle, "Lake", ",\"audience\":\"circle\"");
        for (boolean clip : List.of(false, true)) {
            String more = LAKE + ",\"title\":\"Steering\",\"about\":[\"%s\"]".formatted(mia);
            String id = clip
                    ? video(nora, circle, "2026-11-07T11:20:00+01:00", more)
                    : photo(nora, circle, "2026-11-07T11:42:00+01:00", more);
            send(HttpMethod.POST, "/v1/albums/" + album + "/items", nora, "{\"itemIds\":%s}".formatted(list(id)), 200);

            // Only hers, as everything starts in a family.
            assertThat(seesShot(nora, circle, id, album, mia)).isTrue();
            assertThat(seesShot(alex, circle, id, album, mia)).isFalse();
            assertThat(fetch("/v1/circles/" + circle + "/today", alex)).doesNotContain(id);
            for (String path : List.of("", "/moment", "/comments")) {
                assertThat(status("/v1/library/" + id + path, stranger)).isEqualTo(404);
            }
            for (String path :
                    List.of("/library", "/library/timeline", "/library/places", "/library/lenses", "/storage")) {
                assertThat(status("/v1/circles/" + circle + path, stranger)).isEqualTo(404);
            }
            // Someone it isn't shared with can't love it, comment on it, change it or put it in an album.
            send(HttpMethod.PUT, "/v1/library/" + id + "/love", alex, null, 404);
            send(
                    HttpMethod.POST,
                    "/v1/library/" + id + "/comments",
                    alex,
                    "{\"clientId\":\"%s\",\"body\":\"Hi\"}".formatted(id()),
                    404);
            send(HttpMethod.PATCH, "/v1/library/" + id, alex, "{\"title\":\"Seen\"}", 404);
            assertThat(JsonPath.<Integer>read(
                            send(
                                    HttpMethod.POST,
                                    "/v1/albums/" + album + "/items",
                                    alex,
                                    "{\"itemIds\":%s}".formatted(list(id)),
                                    200),
                            "$.applied"))
                    .isZero();

            // Shared with Alex to look at: he sees it everywhere, loves it, says something, and can't change it.
            shareWith(
                    nora,
                    id,
                    "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(alexId));
            assertThat(seesShot(alex, circle, id, album, mia)).isTrue();
            assertThat(seesShot(kai, circle, id, album, mia)).isFalse();
            assertThat(JsonPath.<List<String>>read(
                            fetch("/v1/circles/" + circle + "/today", alex), "$.fresh[*].thingId"))
                    .contains(id);
            assertThat(fetch("/v1/circles/" + circle + "/today", kai)).doesNotContain(id);
            send(HttpMethod.PUT, "/v1/library/" + id + "/love", alex, null, 204);
            send(HttpMethod.PATCH, "/v1/library/" + id, alex, "{\"title\":\"His\"}", 403);
            send(HttpMethod.PUT, "/v1/things/" + id + "/about", alex, "{\"memberIds\":[]}", 403);
            send(HttpMethod.DELETE, "/v1/things/" + id, alex, null, 403);

            // With everyone, hidden from Kai through today: everyone but Kai. Tomorrow it opens by itself.
            shareWith(
                    nora,
                    id,
                    "{\"audience\":\"circle\",\"hiddenFrom\":[{\"memberId\":\"%s\",\"through\":\"%s\"}]}"
                            .formatted(kaiId, LocalDate.now()));
            assertThat(seesShot(alex, circle, id, album, mia)).isTrue();
            assertThat(seesShot(kai, circle, id, album, mia)).isFalse();
            jdbc.sql("update thing_hides set through = current_date - 1").update();
            assertThat(seesShot(kai, circle, id, album, mia)).isTrue();

            // Taken back: gone for the others at once, and so is the heart he gave from what he can see.
            shareWith(nora, id, "{\"audience\":\"me\"}");
            assertThat(seesShot(alex, circle, id, album, mia)).isFalse();
            assertThat(wall(alex, circle, "?loved=true")).isEmpty();
            send(HttpMethod.DELETE, "/v1/things/" + id, nora, null, 204);
        }
    }

    @Test
    void aDocumentIsReachedByNobodyItIsNotSharedWithWhicheverWayIsTried() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String stranger = person("Stranger");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String kaiId = join(nora, circle, kai);
        String id = document(nora, circle, "Home insurance", "Policy number: HL-204-118", "");
        String folder = album(
                nora, circle, "Papers", ",\"folder\":true,\"audience\":\"circle\",\"itemIds\":%s".formatted(list(id)));

        assertThat(seesFile(nora, circle, id, folder)).isTrue();
        assertThat(seesFile(alex, circle, id, folder)).isFalse();
        assertThat(status("/v1/documents/" + id, stranger)).isEqualTo(404);
        assertThat(status("/v1/circles/" + circle + "/files", stranger)).isEqualTo(404);
        assertThat(status("/v1/circles/" + circle + "/files/summary", stranger)).isEqualTo(404);
        send(HttpMethod.PATCH, "/v1/documents/" + id, alex, "{\"title\":\"Seen\"}", 404);

        shareWith(
                nora,
                id,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(alexId));
        assertThat(seesFile(alex, circle, id, folder)).isTrue();
        assertThat(seesFile(kai, circle, id, folder)).isFalse();
        // New for Alex on Today, with what it is.
        String today = fetch("/v1/circles/" + circle + "/today", alex);
        assertThat(JsonPath.<List<String>>read(today, "$.fresh[*].thingId")).containsExactly(id);
        assertThat(JsonPath.<String>read(today, "$.fresh[0].note")).isEqualTo("Nora added a file");
        assertThat(JsonPath.<String>read(today, "$.fresh[0].pill")).isEqualTo("Insurance");
        assertThat(fetch("/v1/circles/" + circle + "/today", kai)).doesNotContain(id);
        send(HttpMethod.PATCH, "/v1/documents/" + id, alex, "{\"text\":\"Rewritten\"}", 403);

        shareWith(
                nora,
                id,
                "{\"audience\":\"circle\",\"everyoneEdits\":true,\"hiddenFrom\":[{\"memberId\":\"%s\"}]}"
                        .formatted(kaiId));
        assertThat(seesFile(alex, circle, id, folder)).isTrue();
        assertThat(seesFile(kai, circle, id, folder)).isFalse();
        send(HttpMethod.PATCH, "/v1/documents/" + id, alex, "{\"category\":\"home\"}", 200);
        send(HttpMethod.PATCH, "/v1/documents/" + id, kai, "{\"category\":\"other\"}", 404);
    }

    @Test
    void anAlbumIsReachedByNobodyItIsNotSharedWithWhicheverWayIsTried() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String stranger = person("Stranger");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String kaiId = join(nora, circle, kai);
        String photo = photo(nora, circle, "2026-11-07T11:42:00+01:00", ",\"audience\":\"circle\"");
        String album = album(nora, circle, "Surprise for Alex", ",\"itemIds\":%s".formatted(list(photo)));

        for (String outside : List.of(alex, stranger)) {
            assertThat(status("/v1/albums/" + album, outside)).isEqualTo(404);
            assertThat(status("/v1/things/" + album, outside)).isEqualTo(404);
            assertThat(status("/v1/circles/" + circle + "/library?album=" + album, outside))
                    .isEqualTo(404);
            assertThat(status("/v1/circles/" + circle + "/library/timeline?album=" + album, outside))
                    .isEqualTo(404);
            send(HttpMethod.PATCH, "/v1/albums/" + album, outside, "{\"title\":\"Found\"}", 404);
            send(
                    HttpMethod.POST,
                    "/v1/albums/" + album + "/items",
                    outside,
                    "{\"itemIds\":%s}".formatted(list(photo)),
                    404);
            send(HttpMethod.DELETE, "/v1/albums/" + album + "/items/" + photo, outside, null, 404);
        }
        // In the circle, and still nowhere: not in the list, the counts, the photo's own albums, the search or Today.
        assertThat(fetch("/v1/circles/" + circle + "/albums", alex)).doesNotContain(album);
        assertThat(JsonPath.<Integer>read(fetch("/v1/circles/" + circle + "/library/lenses", alex), "$.albums.shared"))
                .isZero();
        assertThat(fetch("/v1/library/" + photo, alex)).doesNotContain(album);
        assertThat(fetch("/v1/circles/" + circle + "/search?q=Surprise", alex)).doesNotContain(album);
        assertThat(fetch("/v1/circles/" + circle + "/today", alex)).doesNotContain(album);

        // Shared with Kai to look at; hidden from Alex although it is for everyone.
        shareWith(
                nora,
                album,
                "{\"audience\":\"circle\",\"everyoneEdits\":false,\"hiddenFrom\":[{\"memberId\":\"%s\"}]}"
                        .formatted(alexId));
        assertThat(status("/v1/albums/" + album, alex)).isEqualTo(404);
        assertThat(fetch("/v1/circles/" + circle + "/albums", alex)).doesNotContain(album);
        assertThat(fetch("/v1/circles/" + circle + "/search?q=Surprise", alex)).doesNotContain(album);
        assertThat(fetch("/v1/circles/" + circle + "/albums?tab=shared", kai)).contains(album);
        assertThat(fetch("/v1/circles/" + circle + "/search?q=Surprise", kai)).contains(album);
        assertThat(JsonPath.<String>read(
                        fetch("/v1/circles/" + circle + "/search?q=Surprise", kai), "$.hits[0].thing.glance"))
                .isEqualTo("1 photo");
        assertThat(JsonPath.<List<String>>read(fetch("/v1/library/" + photo, kai), "$.albums[*].id"))
                .containsExactly(album);
        send(HttpMethod.PATCH, "/v1/albums/" + album, kai, "{\"title\":\"Mine\"}", 403);
        send(HttpMethod.POST, "/v1/albums/" + album + "/items", kai, "{\"itemIds\":%s}".formatted(list(photo)), 403);
        send(HttpMethod.PUT, "/v1/things/" + album + "/audience", kai, "{\"audience\":\"me\"}", 403);
        assertThat(kaiId).isNotEmpty();
    }

    @Test
    void aGuestOnAPassIsShownAPhotoADocumentsNameAndTheAlbumsPicturesThatAreForEveryone() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        String forAll =
                photo(nora, circle, "2026-11-07T11:42:00+01:00", ",\"title\":\"At the lake\",\"audience\":\"circle\"");
        String hers = photo(nora, circle, "2026-11-07T11:40:00+01:00", ",\"title\":\"Not for the sitter\"");
        String clip = video(nora, circle, "2026-11-07T11:30:00+01:00", ",\"audience\":\"circle\"");
        String scan = document(nora, circle, "Vaccination record", "Booster due 3 Dec 2026", ",\"pages\":2");
        String album = album(nora, circle, "The lake", ",\"itemIds\":%s".formatted(list(forAll, hers, clip)));
        String forAllUrl = JsonPath.read(fetch("/v1/library/" + forAll, nora), "$.item.url");
        String hersUrl = JsonPath.read(fetch("/v1/library/" + hers, nora), "$.item.url");

        String pass = send(
                HttpMethod.POST,
                "/v1/circles/" + circle + "/guest-passes",
                nora,
                "{\"clientId\":\"%s\",\"guestName\":\"Ines\",\"endsAt\":\"%s\",\"thingIds\":%s}"
                        .formatted(id(), java.time.Instant.now().plusSeconds(3600), list(album, hers, scan)),
                201);
        String page = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(
                                JsonPath.<String>read(pass, "$.url").replaceFirst("^https?://[^/]+", ""))
                        .param("code", JsonPath.<String>read(pass, "$.code")))
                .andReturn()
                .getResponse()
                .getContentAsString();

        // The album shows the one photo that is for everyone: not the private one, though the pass's maker sees it.
        assertThat(page).contains("The lake").contains("1 photo").contains(forAllUrl);
        // A photo put on the pass itself is shown: that is what its owner chose.
        assertThat(page).contains("Not for the sitter");
        assertThat(page.split(java.util.regex.Pattern.quote(hersUrl), -1)).hasSize(2);
        // A document: its name and how long it is. Not the file, and not the words inside.
        assertThat(page)
                .contains("Vaccination record")
                .contains("2 pages")
                .doesNotContain("Booster")
                .doesNotContain(".pdf");
        // A video can't go on a pass.
        send(
                HttpMethod.POST,
                "/v1/circles/" + circle + "/guest-passes",
                nora,
                "{\"clientId\":\"%s\",\"guestName\":\"Ines\",\"endsAt\":\"%s\",\"thingIds\":%s}"
                        .formatted(id(), java.time.Instant.now().plusSeconds(3600), list(clip)),
                400);
    }
}
