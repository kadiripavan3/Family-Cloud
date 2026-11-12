package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** Albums: made by hand or filling themselves, and showing each person only what they may see. */
class AlbumTest extends LibraryApiTest {

    @Test
    void anAlbumsOwnAudienceDecidesWhoSeesItAndEachThingInItIsStillOnlyShownToWhoMaySeeThatThing() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        join(nora, circle, kai);
        String shared = photo(nora, circle, "2026-08-14T11:00:00+02:00", ",\"audience\":\"circle\"");
        String hers = photo(nora, circle, "2026-08-14T12:00:00+02:00", "");
        String body =
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\" Summer 2026 \",\"note\":\"everyone adds to it\",\"itemIds\":%s}"
                        .formatted(id(), circle, list(shared, hers));

        // Sent twice, made once. It starts as a family's things do: only hers.
        String album = JsonPath.read(send(HttpMethod.POST, "/v1/albums", nora, body, 201), "$.id");
        String again = send(HttpMethod.POST, "/v1/albums", nora, body, 201);
        assertThat(JsonPath.<String>read(again, "$.id")).isEqualTo(album);
        assertThat(JsonPath.<String>read(again, "$.title")).isEqualTo("Summer 2026");
        assertThat(JsonPath.<Integer>read(again, "$.count")).isEqualTo(2);
        assertThat(JsonPath.<String>read(again, "$.chip.audience")).isEqualTo("me");
        assertThat(status("/v1/albums/" + album, alex)).isEqualTo(404);
        assertThat(fetch("/v1/circles/" + circle + "/albums", alex)).doesNotContain(album);
        assertThat(status("/v1/circles/" + circle + "/library?album=" + album, alex))
                .isEqualTo(404);

        // Shared with Alex to look at: he sees the album and, in it, the one photo that is shared with him.
        shareWith(
                nora,
                album,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(alexId));
        String forAlex = fetch("/v1/albums/" + album, alex);
        assertThat(JsonPath.<Integer>read(forAlex, "$.count")).isEqualTo(1);
        assertThat(JsonPath.<Boolean>read(forAlex, "$.canEdit")).isFalse();
        assertThat(JsonPath.<Boolean>read(forAlex, "$.everyoneAdds")).isFalse();
        assertThat(wall(alex, circle, "?album=" + album)).containsExactly(shared);
        assertThat(wall(nora, circle, "?album=" + album)).containsExactly(hers, shared);
        assertThat(status("/v1/library/" + hers + "?album=" + album, alex)).isEqualTo(404);
        assertThat(JsonPath.<List<String>>read(fetch("/v1/library/" + shared, alex), "$.albums[*].id"))
                .containsExactly(album);
        assertThat(status("/v1/albums/" + album, kai)).isEqualTo(404);
        assertThat(JsonPath.<List<String>>read(fetch("/v1/library/" + shared, kai), "$.albums"))
                .isEmpty();

        // He may look, not add; nor rename it.
        String his = photo(alex, circle, "2026-08-15T09:00:00+02:00", "");
        send(HttpMethod.POST, "/v1/albums/" + album + "/items", alex, "{\"itemIds\":%s}".formatted(list(his)), 403);
        send(HttpMethod.PATCH, "/v1/albums/" + album, alex, "{\"title\":\"His\"}", 403);
        send(HttpMethod.DELETE, "/v1/albums/" + album + "/items/" + shared, alex, null, 403);

        // With everyone, and everyone adding: he puts his own in, and can't put in what he can't see.
        shareWith(nora, album, "{\"audience\":\"circle\",\"everyoneEdits\":true}");
        String added = send(
                HttpMethod.POST,
                "/v1/albums/" + album + "/items",
                alex,
                "{\"itemIds\":%s}".formatted(list(his, hers, shared, id())),
                200);
        assertThat(JsonPath.<Integer>read(added, "$.applied")).isEqualTo(2); // his, and the one already in it
        assertThat(JsonPath.<Integer>read(added, "$.skipped")).isEqualTo(2);
        assertThat(JsonPath.<Boolean>read(fetch("/v1/albums/" + album, alex), "$.everyoneAdds"))
                .isTrue();
        // His photo is only his: in the album he sees two, Nora still two (hers and the shared one), Kai one.
        assertThat(wall(alex, circle, "?album=" + album)).containsExactly(his, shared);
        assertThat(wall(nora, circle, "?album=" + album)).containsExactly(hers, shared);
        assertThat(JsonPath.<Integer>read(fetch("/v1/albums/" + album, kai), "$.count"))
                .isEqualTo(1);

        // Taking something out leaves the thing itself where it was. Deleting the album leaves the photos.
        send(HttpMethod.DELETE, "/v1/albums/" + album + "/items/" + shared, alex, null, 204);
        assertThat(wall(nora, circle, "?album=" + album)).containsExactly(hers);
        assertThat(status("/v1/library/" + shared, nora)).isEqualTo(200);
        send(HttpMethod.DELETE, "/v1/things/" + album, alex, null, 403);
        send(HttpMethod.DELETE, "/v1/things/" + album, nora, null, 204);
        assertThat(status("/v1/albums/" + album, nora)).isEqualTo(404);
        assertThat(wall(nora, circle, "")).containsExactly(hers, shared);
    }

    @Test
    void anAlbumCanFillItselfWithEveryPhotoOneMemberIsInAsFarAsTheViewerMaySeeThem() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String mia = addMember(nora, circle, "Mia", "child");
        String dog = addMember(nora, circle, "Biscuit", "pet");
        String elsewhere = addMember(nora, circle(nora, "crew", "Lisbon crew"), "Tim", "child");
        String album = album(nora, circle, "Mia", ",\"personId\":\"%s\",\"audience\":\"circle\"".formatted(mia));
        String dogs = album(nora, circle, "Biscuit", ",\"personId\":\"%s\",\"note\":\"mostly asleep\"".formatted(dog));

        // Nothing is tagged yet.
        String empty = fetch("/v1/albums/" + album, nora);
        assertThat(JsonPath.<Integer>read(empty, "$.count")).isZero();
        assertThat(JsonPath.<String>read(empty, "$.origin")).isEqualTo("person");
        assertThat(JsonPath.<String>read(empty, "$.person.name")).isEqualTo("Mia");
        assertThat(JsonPath.<Object>read(empty, "$.coverUrl")).isNull();

        // Saying who is in a photo is all it takes: by hand, with the route every kind of thing shares.
        String both = photo(nora, circle, "2026-11-07T10:00:00+01:00", ",\"audience\":\"circle\"");
        String private_ = photo(nora, circle, "2026-11-07T10:05:00+01:00", ",\"about\":[\"%s\"]".formatted(mia));
        String byAlex = video(
                alex,
                circle,
                "2026-11-07T10:10:00+01:00",
                ",\"audience\":\"circle\",\"about\":[\"%s\"]".formatted(mia));
        String report = document(
                nora,
                circle,
                "School report",
                "Class 4B",
                ",\"about\":[\"%s\"],\"audience\":\"circle\"".formatted(mia));
        send(
                HttpMethod.PUT,
                "/v1/things/" + both + "/about",
                nora,
                "{\"memberIds\":[\"%s\",\"%s\"]}".formatted(mia, dog),
                204);

        assertThat(wall(nora, circle, "?album=" + album)).containsExactly(byAlex, private_, both);
        assertThat(wall(alex, circle, "?album=" + album)).containsExactly(byAlex, both);
        assertThat(wall(nora, circle, "?album=" + dogs)).containsExactly(both);
        assertThat(wall(nora, circle, "?album=" + album + "&kind=video")).containsExactly(byAlex);
        String forNora = fetch("/v1/albums/" + album, nora);
        assertThat(JsonPath.<Integer>read(forNora, "$.count"))
                .isEqualTo(3); // the report is on her page, not in her album
        assertThat(JsonPath.<Integer>read(forNora, "$.fresh")).isEqualTo(1); // what Alex added is news to Nora
        assertThat(JsonPath.<String>read(forNora, "$.coverUrl")).isNotNull();
        assertThat(JsonPath.<List<String>>read(forNora, "$.contributors[*].name"))
                .containsExactly("Nora", "Alex");
        assertThat(JsonPath.<Integer>read(fetch("/v1/albums/" + album, alex), "$.count"))
                .isEqualTo(2);
        assertThat(JsonPath.<String>read(fetch("/v1/albums/" + dogs, nora), "$.note"))
                .isEqualTo("mostly asleep");
        assertThat(JsonPath.<List<String>>read(fetch("/v1/library/" + both, alex), "$.albums[*].title"))
                .containsExactly("Mia"); // Biscuit's album is only Nora's
        assertThat(report).isNotEmpty();

        // Taking the tag away takes it out; nothing is put in by hand; and it is for someone of this circle.
        send(HttpMethod.PUT, "/v1/things/" + both + "/about", nora, "{\"memberIds\":[]}", 204);
        assertThat(wall(alex, circle, "?album=" + album)).containsExactly(byAlex);
        send(HttpMethod.POST, "/v1/albums/" + album + "/items", nora, "{\"itemIds\":%s}".formatted(list(both)), 400);
        send(
                HttpMethod.POST,
                "/v1/albums",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Tim\",\"personId\":\"%s\"}"
                        .formatted(id(), circle, elsewhere),
                400);

        // When the member goes, the album stays and is empty.
        send(HttpMethod.DELETE, "/v1/members/" + mia, nora, null, 204);
        assertThat(wall(nora, circle, "?album=" + album)).isEmpty();
        assertThat(JsonPath.<Integer>read(fetch("/v1/albums/" + album, nora), "$.count"))
                .isZero();
    }

    @Test
    void theTabsCountSharedAndOnlyYoursAndTheListComesInPages() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String shared = album(nora, circle, "Summer", ",\"audience\":\"circle\"");
        String hers = album(nora, circle, "For the photo book", "");
        String his = album(alex, circle, "His own", "");
        String fromHim = album(alex, circle, "From Alex", ",\"audience\":\"circle\"");
        String folder = album(nora, circle, "Tax 2025", ",\"folder\":true");
        jdbc.sql("update albums set origin = 'journey' where thing_id = cast(:id as uuid)")
                .param("id", fromHim)
                .update();

        String lenses = fetch("/v1/circles/" + circle + "/library/lenses", nora);
        assertThat(JsonPath.<Integer>read(lenses, "$.albums.shared")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(lenses, "$.albums.onlyYou")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(lenses, "$.albums.fromJourney")).isEqualTo(1);
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/albums?tab=shared", nora), "$.items[*].id"))
                .containsExactly(shared);
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/albums?tab=mine", nora), "$.items[*].id"))
                .containsExactly(hers);
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/albums?tab=journey", nora), "$.items[*].id"))
                .containsExactly(fromHim);
        // All of them, last changed first, a page at a time; a folder of files is not among the albums.
        String first = fetch("/v1/circles/" + circle + "/albums?limit=2", nora);
        assertThat(JsonPath.<List<String>>read(first, "$.items[*].id")).containsExactly(fromHim, hers);
        String next = fetch(
                "/v1/circles/" + circle + "/albums?limit=2&cursor=" + JsonPath.<String>read(first, "$.nextCursor"),
                nora);
        assertThat(JsonPath.<List<String>>read(next, "$.items[*].id")).containsExactly(shared);
        assertThat(JsonPath.<Object>read(next, "$.nextCursor")).isNull();
        assertThat(his).isNotEqualTo(folder);
        send(HttpMethod.GET, "/v1/circles/" + circle + "/albums?tab=old", nora, null, 400);
        send(
                HttpMethod.POST,
                "/v1/albums",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\" \"}".formatted(id(), circle),
                400);
    }

    @Test
    void aCoverChosenByHandIsShownToWhoMaySeeItAndEveryoneElseGetsTheNewestTheyMaySee() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String old = photo(nora, circle, "2025-08-14T11:00:00+02:00", ",\"audience\":\"circle\"");
        String newest = photo(nora, circle, "2026-08-14T11:00:00+02:00", ",\"audience\":\"circle\"");
        String hers = photo(nora, circle, "2024-08-14T11:00:00+02:00", "");
        String scan = document(nora, circle, "Lease", "", "");
        String album = album(
                nora, circle, "Summers", ",\"audience\":\"circle\",\"itemIds\":%s".formatted(list(old, newest, hers)));
        String thumbOf = "$.item.url";
        String newestUrl = JsonPath.read(fetch("/v1/library/" + newest, nora), thumbOf);
        String hersUrl = JsonPath.read(fetch("/v1/library/" + hers, nora), thumbOf);

        assertThat(JsonPath.<String>read(fetch("/v1/albums/" + album, nora), "$.coverUrl"))
                .isEqualTo(newestUrl);

        String changed = send(
                HttpMethod.PATCH,
                "/v1/albums/" + album,
                nora,
                "{\"coverItemId\":\"%s\",\"note\":\"ours\"}".formatted(hers),
                200);
        assertThat(JsonPath.<String>read(changed, "$.coverUrl")).isEqualTo(hersUrl);
        assertThat(JsonPath.<String>read(changed, "$.note")).isEqualTo("ours");
        assertThat(JsonPath.<String>read(fetch("/v1/albums/" + album, alex), "$.coverUrl"))
                .isEqualTo(newestUrl);

        // A cover is a picture of this circle's Library that the person choosing it may see.
        send(HttpMethod.PATCH, "/v1/albums/" + album, nora, "{\"coverItemId\":\"%s\"}".formatted(scan), 400);
        send(HttpMethod.PATCH, "/v1/albums/" + album, alex, "{\"coverItemId\":\"%s\"}".formatted(hers), 404);
        assertThat(JsonPath.<String>read(
                        send(HttpMethod.PATCH, "/v1/albums/" + album, nora, "{\"removeCover\":true}", 200),
                        "$.coverUrl"))
                .isEqualTo(newestUrl);
    }
}
