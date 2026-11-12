package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import app.homeport.api.media.MediaService;
import app.homeport.api.media.MediaSizes;
import com.jayway.jsonpath.JsonPath;
import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

/** The Library: adding photos, videos and documents, the wall, moments, one photo, and doing things to many at once. */
class LibraryTest extends LibraryApiTest {

    @Autowired
    MediaService media;

    private byte[] download(String url) throws Exception {
        return mvc.perform(get(URI.create(url))).andReturn().getResponse().getContentAsByteArray();
    }

    // ---------- adding ----------

    @Test
    void aPhotoKeepsTheFileAsItWasSentNextToItsThreeSizesAndTheSameFileSentAgainIsRecognised() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "family", "The Linds");
        byte[] original = picture();
        String hash = MediaSizes.sha256(original);

        // Before sending: nothing known. Then the photo goes in.
        String check = "{\"circleId\":\"%s\",\"hashes\":[\"%s\"]}".formatted(circle, hash.toUpperCase());
        assertThat(JsonPath.<List<Object>>read(send(HttpMethod.POST, "/v1/library/check", nora, check, 200), "$.known"))
                .isEmpty();
        String added = addOne(nora, circle, sendFile(nora, "photo", "image/jpeg", original, ""), "");
        String id = JsonPath.read(added, "$.items[0].item.id");
        assertThat(JsonPath.<Boolean>read(added, "$.items[0].alreadyThere")).isFalse();

        // The file itself is kept untouched, under an address of its own, and the three sizes stand next to it.
        String item = fetch("/v1/library/" + id, nora);
        String fileUrl = JsonPath.read(item, "$.item.fileUrl");
        assertThat(fileUrl).contains("/originals/");
        assertThat(download(fileUrl)).isEqualTo(original);
        for (String size : List.of("$.item.thumbUrl", "$.item.url", "$.largeUrl")) {
            String url = JsonPath.read(item, size);
            assertThat(url).contains("/photos/").doesNotContain("originals");
            assertThat(download(url)).isNotEmpty().isNotEqualTo(original);
        }
        assertThat(JsonPath.<Integer>read(item, "$.item.width")).isEqualTo(48);
        assertThat(JsonPath.<Integer>read(item, "$.bytes")).isGreaterThan(original.length);
        // Where it arrived, nothing is left.
        assertThat(jdbc.sql("select count(*) from media where storage_key like 'incoming/%'")
                        .query(Integer.class)
                        .single())
                .isZero();

        // Now the phone asks first, and is told. If it sends the file again anyway, it gets the photo it has.
        assertThat(JsonPath.<List<String>>read(
                        send(HttpMethod.POST, "/v1/library/check", nora, check, 200), "$.known[*].id"))
                .containsExactly(id);
        String again = addOne(nora, circle, sendFile(nora, "photo", "image/jpeg", original, ""), "");
        assertThat(JsonPath.<String>read(again, "$.items[0].item.id")).isEqualTo(id);
        assertThat(JsonPath.<Boolean>read(again, "$.items[0].alreadyThere")).isTrue();
        assertThat(wall(nora, circle, "")).containsExactly(id);
        assertThat(jdbc.sql("select count(*) from media where kind = 'photo'")
                        .query(Integer.class)
                        .single())
                .as("the second copy isn't kept")
                .isEqualTo(1);

        // A video is not read by the API: the phone says its fingerprint, and it is recognised by that.
        String print = "ab12".repeat(16);
        String clip = addOne(
                nora,
                circle,
                sendFile(nora, "video", "video/mp4", "a clip".getBytes(), ""),
                ",\"contentHash\":\"%s\"".formatted(print));
        String clipAgain = addOne(
                nora,
                circle,
                sendFile(nora, "video", "video/mp4", "a clip".getBytes(), ""),
                ",\"contentHash\":\"%s\"".formatted(print.toUpperCase()));
        assertThat(JsonPath.<Boolean>read(clipAgain, "$.items[0].alreadyThere")).isTrue();
        assertThat(JsonPath.<String>read(clipAgain, "$.items[0].item.id"))
                .isEqualTo(JsonPath.<String>read(clip, "$.items[0].item.id"));
        assertThat(jdbc.sql("select count(*) from media where kind = 'video'")
                        .query(Integer.class)
                        .single())
                .isEqualTo(1);
        send(
                HttpMethod.POST,
                "/v1/library/check",
                nora,
                "{\"circleId\":\"%s\",\"hashes\":[\"not a fingerprint\"]}".formatted(circle),
                400);
        // A phone that says the same fingerprint for a file of another size is not believed: both are kept.
        String other = addOne(
                nora,
                circle,
                sendFile(nora, "video", "video/mp4", "quite another clip".getBytes(), ""),
                ",\"contentHash\":\"%s\"".formatted(print));
        assertThat(JsonPath.<Boolean>read(other, "$.items[0].alreadyThere")).isFalse();
        assertThat(JsonPath.<String>read(other, "$.items[0].item.id"))
                .isNotEqualTo(JsonPath.<String>read(clip, "$.items[0].item.id"));
        // And an upload that is in one circle's Library is not quietly answered with for another circle.
        String elsewhere = circle(nora, "solo", "Just me");
        String upload = sendFile(nora, "photo", "image/jpeg", picture(), "");
        addOne(nora, circle, upload, "");
        assertThat(JsonPath.<String>read(addOne(nora, elsewhere, upload, ""), "$.items[0].problem.code"))
                .isEqualTo("in_another_circle");

        // Someone else sending the same file is not told about hers, and gets a photo of their own.
        String alex = person("Alex");
        join(nora, circle, alex);
        assertThat(JsonPath.<List<Object>>read(send(HttpMethod.POST, "/v1/library/check", alex, check, 200), "$.known"))
                .isEmpty();
        String his = addOne(alex, circle, sendFile(alex, "photo", "image/jpeg", original, ""), "");
        assertThat(JsonPath.<String>read(his, "$.items[0].item.id")).isNotEqualTo(id);
        assertThat(JsonPath.<Boolean>read(his, "$.items[0].alreadyThere")).isFalse();
    }

    @Test
    void aBatchSentTwiceAddsEachFileOnceAndOneThatCannotBeAddedDoesNotHoldTheOthersBack() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String first = sendFile(nora, "photo", "image/jpeg", picture(), "");
        String second = sendFile(nora, "photo", "image/jpeg", picture(), "");
        String notHers = sendFile(alex, "photo", "image/jpeg", picture(), "");
        String unfinished = JsonPath.read(startPhoto(nora, "image/jpeg"), "$.mediaId");
        String batch = "{\"circleId\":\"%s\",\"items\":[%s]}"
                .formatted(
                        circle,
                        String.join(
                                ",",
                                "{\"clientId\":\"%s\",\"mediaId\":\"%s\",\"title\":\"One\"}".formatted(id(), first),
                                "{\"clientId\":\"%s\",\"mediaId\":\"%s\"}".formatted(id(), notHers),
                                "{\"clientId\":\"%s\",\"mediaId\":\"%s\"}".formatted(id(), unfinished),
                                "{\"clientId\":\"%s\",\"mediaId\":\"%s\",\"title\":\"Two\"}".formatted(id(), second)));

        String once = send(HttpMethod.POST, "/v1/library", nora, batch, 201);
        String twice = send(HttpMethod.POST, "/v1/library", nora, batch, 201);

        assertThat(JsonPath.<List<String>>read(once, "$.items[*].clientId")).hasSize(4);
        assertThat(JsonPath.<String>read(once, "$.items[0].item.title")).isEqualTo("One");
        assertThat(JsonPath.<Object>read(once, "$.items[1].item")).isNull();
        assertThat(JsonPath.<Object>read(once, "$.items[2].item")).isNull();
        assertThat(JsonPath.<String>read(once, "$.items[3].item.title")).isEqualTo("Two");
        assertThat(JsonPath.<String>read(once, "$.items[1].problem.code")).isEqualTo("media_not_ready");
        assertThat(JsonPath.<String>read(once, "$.items[2].problem.message")).contains("didn't finish uploading");
        for (int n : List.of(0, 3)) {
            assertThat(JsonPath.<String>read(twice, "$.items[" + n + "].item.id"))
                    .isEqualTo(JsonPath.<String>read(once, "$.items[" + n + "].item.id"));
        }
        assertThat(JsonPath.<List<Boolean>>read(twice, "$.items[*].alreadyThere"))
                .containsOnly(false);
        assertThat(wall(nora, circle, "")).hasSize(2);
        // It starts as a family's things do: only hers.
        assertThat(JsonPath.<String>read(once, "$.items[0].item.chip.audience")).isEqualTo("me");
        assertThat(wall(alex, circle(alex, "solo", "Alex alone"), "")).isEmpty();

        // The same upload under a new clientId is still the same photo, and too many at once are refused.
        String sameUpload = addOne(nora, circle, first, "");
        assertThat(JsonPath.<String>read(sameUpload, "$.items[0].item.id"))
                .isEqualTo(JsonPath.<String>read(once, "$.items[0].item.id"));
        List<String> many = new ArrayList<>();
        for (int i = 0; i < 101; i++) {
            many.add("{\"clientId\":\"%s\",\"mediaId\":\"%s\"}".formatted(id(), first));
        }
        send(
                HttpMethod.POST,
                "/v1/library",
                nora,
                "{\"circleId\":\"%s\",\"items\":[%s]}".formatted(circle, String.join(",", many)),
                400);
        send(HttpMethod.POST, "/v1/library", nora, "{\"circleId\":\"%s\",\"items\":[]}".formatted(circle), 400);
    }

    @Test
    void whatThePhoneSaysAboutAFileIsKeptAndShownAndCanBeCorrected() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);

        String photo = photo(
                nora,
                circle,
                "2026-11-07T11:42:00+01:00",
                ",\"title\":\"  Mia's first time steering \",\"lat\":46.3625,\"lng\":14.0938,\"placeName\":\"Lake Bled\",\"country\":\"Slovenia\",\"audience\":\"circle\"");
        String video = video(nora, circle, "2026-11-07T11:20:00+01:00", ",\"placeName\":\"Lake Bled\"");
        String recording = sendFile(nora, "audio", "audio/mp4", "a voice".getBytes(), "");

        String item = fetch("/v1/library/" + photo, alex);
        assertThat(JsonPath.<String>read(item, "$.item.title")).isEqualTo("Mia's first time steering");
        assertThat(JsonPath.<String>read(item, "$.item.kind")).isEqualTo("photo");
        assertThat(JsonPath.<String>read(item, "$.item.takenAt")).isEqualTo("2026-11-07T10:42:00Z");
        assertThat(JsonPath.<String>read(item, "$.item.takenLocal")).isEqualTo("2026-11-07T11:42:00");
        assertThat(JsonPath.<String>read(item, "$.item.placeName")).isEqualTo("Lake Bled");
        assertThat(JsonPath.<String>read(item, "$.country")).isEqualTo("Slovenia");
        assertThat(JsonPath.<Double>read(item, "$.lat")).isEqualTo(46.3625);
        assertThat(JsonPath.<String>read(item, "$.item.addedBy.name")).isEqualTo("Nora");
        assertThat(JsonPath.<Boolean>read(item, "$.item.mine")).isFalse();
        assertThat(JsonPath.<Boolean>read(item, "$.item.canEdit")).isTrue();

        String clip = fetch("/v1/library/" + video, nora);
        assertThat(JsonPath.<String>read(clip, "$.item.kind")).isEqualTo("video");
        assertThat(JsonPath.<Integer>read(clip, "$.item.durationSeconds")).isEqualTo(42);
        assertThat(JsonPath.<String>read(clip, "$.item.thumbUrl")).contains("/photos/"); // its still
        assertThat(JsonPath.<String>read(clip, "$.item.fileUrl"))
                .contains("/videos/")
                .endsWith(".mp4");
        assertThat(JsonPath.<String>read(clip, "$.contentType")).isEqualTo("video/mp4");

        // Whoever may change it corrects the caption, the time and the place; someone who may only look can't.
        String changed = send(
                HttpMethod.PATCH,
                "/v1/library/" + photo,
                alex,
                "{\"title\":\"Steering\",\"takenAt\":\"2026-11-07T23:30:00-05:00\",\"placeName\":\"Bled\"}",
                200);
        assertThat(JsonPath.<String>read(changed, "$.item.title")).isEqualTo("Steering");
        assertThat(JsonPath.<String>read(changed, "$.item.takenLocal")).isEqualTo("2026-11-07T23:30:00");
        assertThat(JsonPath.<String>read(changed, "$.item.takenAt")).isEqualTo("2026-11-08T04:30:00Z");
        assertThat(JsonPath.<String>read(changed, "$.item.placeName")).isEqualTo("Bled");
        assertThat(JsonPath.<Double>read(changed, "$.lat")).isEqualTo(46.3625);
        assertThat(JsonPath.<Object>read(
                        send(HttpMethod.PATCH, "/v1/library/" + photo, nora, "{\"removePlace\":true}", 200), "$.lat"))
                .isNull();
        shareWith(
                nora,
                photo,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(alexId));
        send(HttpMethod.PATCH, "/v1/library/" + photo, alex, "{\"title\":\"Mine\"}", 403);
        send(HttpMethod.PATCH, "/v1/library/" + photo, nora, "{\"lat\":12.5}", 400);

        // What can't be: a recording in the Library, a video called a photo, half a place, a place off the globe.
        assertThat(JsonPath.<String>read(addOne(nora, circle, recording, ""), "$.items[0].problem.code"))
                .isEqualTo("not_for_the_library");
        String anotherClip = sendFile(nora, "video", "video/mp4", "clip".getBytes(), "");
        assertThat(JsonPath.<String>read(
                        addOne(nora, circle, anotherClip, ",\"kind\":\"photo\""), "$.items[0].problem.code"))
                .isEqualTo("wrong_kind");
        assertThat(JsonPath.<String>read(addOne(nora, circle, anotherClip, ",\"lat\":46.1"), "$.items[0].problem.code"))
                .isEqualTo("invalid_place");
        send(
                HttpMethod.POST,
                "/v1/library",
                nora,
                "{\"circleId\":\"%s\",\"items\":[{\"clientId\":\"%s\",\"mediaId\":\"%s\",\"lat\":91,\"lng\":0}]}"
                        .formatted(circle, id(), anotherClip),
                400);
    }

    @Test
    void anAdultAddsForAChildWithoutAPhoneAndNobodyAddsForSomeoneWithTheirOwn() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String teen = person("Kai");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String teenId = join(nora, circle, teen);
        send(HttpMethod.PATCH, "/v1/members/" + teenId, nora, "{\"role\":\"teen\"}", 200);
        String mia = addMember(nora, circle, "Mia", "child");
        String elsewhere = addMember(nora, circle(nora, "family", "Other"), "Tim", "child");

        // Mia's tablet is signed in as her mum: the photo is Nora's to share, and Mia's on every screen.
        String hers = photo(nora, circle, "2026-11-07T10:00:00+01:00", ",\"addedBy\":\"%s\"".formatted(mia));
        String item = fetch("/v1/library/" + hers, nora);
        assertThat(JsonPath.<String>read(item, "$.item.addedBy.name")).isEqualTo("Mia");
        assertThat(JsonPath.<Boolean>read(item, "$.item.mine")).isTrue();
        assertThat(wall(nora, circle, "?by=" + mia)).containsExactly(hers);
        assertThat(wall(nora, circle, "?by=" + alexId)).isEmpty();

        String upload = sendFile(nora, "photo", "image/jpeg", picture(), "");
        assertThat(JsonPath.<String>read(
                        addOne(nora, circle, upload, ",\"addedBy\":\"%s\"".formatted(alexId)),
                        "$.items[0].problem.code"))
                .isEqualTo("not_yours_to_do");
        assertThat(JsonPath.<String>read(
                        addOne(nora, circle, upload, ",\"addedBy\":\"%s\"".formatted(elsewhere)),
                        "$.items[0].problem.code"))
                .isEqualTo("not_in_circle");
        String teens = sendFile(teen, "photo", "image/jpeg", picture(), "");
        assertThat(JsonPath.<String>read(
                        addOne(teen, circle, teens, ",\"addedBy\":\"%s\"".formatted(mia)), "$.items[0].problem.code"))
                .isEqualTo("not_yours_to_do");

        // When the child is taken out of the circle, her photos stay, as her mum's.
        send(HttpMethod.DELETE, "/v1/members/" + mia, nora, null, 204);
        assertThat(JsonPath.<String>read(fetch("/v1/library/" + hers, nora), "$.item.addedBy.name"))
                .isEqualTo("Nora");
    }

    // ---------- the wall ----------

    @Test
    void theWallIsNewestTakenFirstInPagesThatNeitherRepeatNorSkipAndJumpsToADay() throws Exception {
        String nora = person("Nora");
        String circle = circle(nora, "crew", "Lisbon crew");
        List<String> ids = new ArrayList<>();
        // Sent in no particular order; two were taken at the very same moment.
        for (String taken : List.of(
                "2026-11-07T11:42:00+01:00",
                "2024-03-01T08:00:00+01:00",
                "2026-11-07T11:42:00+01:00",
                "2026-11-05T19:40:00+01:00",
                "2025-12-31T23:58:00+01:00",
                "2026-08-14T11:05:00+08:00",
                "2026-11-07T09:12:00+01:00")) {
            ids.add(photo(nora, circle, taken, ""));
        }

        Set<String> seen = new LinkedHashSet<>();
        List<String> times = new ArrayList<>();
        String cursor = null;
        do {
            String page = fetch(
                    "/v1/circles/" + circle + "/library?limit=3" + (cursor == null ? "" : "&cursor=" + cursor), nora);
            List<String> got = JsonPath.read(page, "$.items[*].id");
            assertThat(seen).doesNotContainAnyElementsOf(got);
            seen.addAll(got);
            times.addAll(JsonPath.<List<String>>read(page, "$.items[*].takenLocal"));
            cursor = JsonPath.read(page, "$.nextCursor");
        } while (cursor != null);

        assertThat(seen).containsExactlyInAnyOrderElementsOf(ids);
        assertThat(times).isSortedAccordingTo(java.util.Comparator.reverseOrder());
        assertThat(times.get(times.size() - 1)).isEqualTo("2024-03-01T08:00:00");

        // The strip at the side jumps: from the end of that day back.
        assertThat(wall(nora, circle, "?until=2026-08-14")).containsExactly(ids.get(5), ids.get(4), ids.get(1));
        assertThat(wall(nora, circle, "?until=2025-12-30")).containsExactly(ids.get(1));
        send(HttpMethod.GET, "/v1/circles/" + circle + "/library?cursor=nonsense", nora, null, 400);
    }

    @Test
    void theLensesNarrowTheWallToAKindAPersonAPlaceWhatYouLovedOrAnAlbum() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        String noraId = JsonPath.read(fetch("/v1/circles/" + circle, nora), "$.myMemberId");
        String alexId = join(nora, circle, alex);
        String dog = addMember(nora, circle, "Biscuit", "pet");
        String lake = photo(nora, circle, "2026-11-07T11:00:00+01:00", ",\"placeName\":\"Lake Bled\"");
        String clip = video(alex, circle, "2026-11-07T10:00:00+01:00", ",\"placeName\":\"lake bled\"");
        String home = photo(
                alex, circle, "2026-11-05T19:00:00+01:00", ",\"placeName\":\"Home\",\"about\":[\"%s\"]".formatted(dog));
        String scan = document(nora, circle, "Lease", "Tenancy agreement", "");
        send(HttpMethod.PUT, "/v1/library/" + clip + "/love", nora, null, 204);
        send(HttpMethod.PUT, "/v1/library/" + home + "/love", alex, null, 204);
        send(
                HttpMethod.PUT,
                "/v1/things/" + lake + "/about",
                nora,
                "{\"memberIds\":[\"%s\",\"%s\"]}".formatted(dog, alexId),
                204);
        String album = album(nora, circle, "Best of", ",\"itemIds\":%s".formatted(list(home, scan)));

        assertThat(wall(nora, circle, "")).containsExactly(lake, clip, home); // a document is not on the wall
        assertThat(wall(nora, circle, "?kind=video")).containsExactly(clip);
        assertThat(wall(nora, circle, "?kind=photo")).containsExactly(lake, home);
        assertThat(wall(nora, circle, "?loved=true")).containsExactly(clip);
        assertThat(wall(alex, circle, "?loved=true")).containsExactly(home);
        assertThat(wall(nora, circle, "?by=" + alexId)).containsExactly(clip, home);
        assertThat(wall(nora, circle, "?by=" + noraId + "&kind=video")).isEmpty();
        assertThat(wall(nora, circle, "?about=" + dog)).containsExactly(lake, home);
        assertThat(wall(nora, circle, "?about=" + alexId)).containsExactly(lake);
        assertThat(wall(nora, circle, "?place=Lake Bled")).containsExactly(lake, clip);
        assertThat(wall(nora, circle, "?place=LAKE BLED&by=" + alexId)).containsExactly(clip);
        assertThat(wall(nora, circle, "?album=" + album)).containsExactly(scan, home); // an album holds what was put in
        assertThat(wall(nora, circle, "?album=" + album + "&kind=photo")).containsExactly(home);
        assertThat(JsonPath.<List<Boolean>>read(fetch("/v1/circles/" + circle + "/library", nora), "$.items[*].loved"))
                .containsExactly(false, true, false);
        send(HttpMethod.GET, "/v1/circles/" + circle + "/library?kind=song", nora, null, 400);
        send(HttpMethod.GET, "/v1/circles/" + circle + "/library?album=" + lake, nora, null, 404);
    }

    // ---------- moments ----------

    @Test
    void threePeoplesPhotosOfOneSaturdayComeTogetherAsOneMomentForWhoeverMaySeeThem() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String mia = addMember(nora, circle, "Mia", "child");
        String lake = ",\"lat\":46.3625,\"lng\":14.0938,\"placeName\":\"Lake Bled\",\"audience\":\"circle\"";
        String noras = photo(nora, circle, "2026-11-07T09:12:00+01:00", lake);
        String mias = photo(nora, circle, "2026-11-07T10:05:00+01:00", lake + ",\"addedBy\":\"%s\"".formatted(mia));
        String alexs = photo(alex, circle, "2026-11-07T10:40:00+01:00", lake);
        String clip = video(alex, circle, "2026-11-07T11:42:00+01:00", lake);
        String alexOnly = photo(
                alex,
                circle,
                "2026-11-07T11:00:00+01:00",
                ",\"lat\":46.3630,\"lng\":14.0940,\"placeName\":\"Lake Bled\"");
        String thursday =
                photo(nora, circle, "2026-11-05T19:40:00+01:00", ",\"placeName\":\"Home\",\"audience\":\"circle\"");

        // Nora sees four of the five at the lake: Alex kept one to himself.
        String wall = fetch("/v1/circles/" + circle + "/library", nora);
        assertThat(JsonPath.<List<String>>read(wall, "$.items[*].id"))
                .containsExactly(clip, alexs, mias, noras, thursday);
        assertThat(JsonPath.<List<String>>read(wall, "$.moments[*].title"))
                .containsExactly("Saturday at Lake Bled", "Thursday");
        assertThat(JsonPath.<List<String>>read(wall, "$.items[*].momentId"))
                .containsExactly(clip, clip, clip, clip, thursday);
        assertThat(JsonPath.<String>read(wall, "$.moments[0].id")).isEqualTo(clip);

        // Any of its photos leads to the moment.
        String moment = fetch("/v1/library/" + noras + "/moment", nora);
        assertThat(JsonPath.<String>read(moment, "$.id")).isEqualTo(clip);
        assertThat(JsonPath.<String>read(moment, "$.day")).isEqualTo("2026-11-07");
        assertThat(JsonPath.<String>read(moment, "$.placeName")).isEqualTo("Lake Bled");
        assertThat(JsonPath.<Integer>read(moment, "$.total")).isEqualTo(4);
        assertThat(JsonPath.<Integer>read(moment, "$.photos")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(moment, "$.videos")).isEqualTo(1);
        assertThat(JsonPath.<Boolean>read(moment, "$.shared")).isTrue();
        assertThat(JsonPath.<String>read(moment, "$.audience")).isEqualTo("circle");
        assertThat(JsonPath.<List<String>>read(moment, "$.people[*].name")).containsExactly("Alex", "Nora", "Mia");
        assertThat(JsonPath.<List<Integer>>read(moment, "$.people[*].count")).containsExactly(2, 1, 1);
        assertThat(JsonPath.<List<Boolean>>read(moment, "$.people[*].you")).containsExactly(false, true, false);
        assertThat(JsonPath.<String>read(moment, "$.coverUrl")).contains("/photos/"); // the newest: the video's still

        // Alex sees his own fifth in it as well, and for him it isn't all for everyone.
        String his = fetch("/v1/library/" + alexOnly + "/moment", alex);
        assertThat(JsonPath.<Integer>read(his, "$.total")).isEqualTo(5);
        assertThat(JsonPath.<String>read(his, "$.audience")).isEqualTo("some");
        assertThat(JsonPath.<List<Integer>>read(his, "$.people[*].count")).containsExactly(3, 1, 1);
        send(HttpMethod.GET, "/v1/library/" + alexOnly + "/moment", nora, null, 404);

        // The wall narrowed to the moment, and to one person's part of it.
        assertThat(wall(nora, circle, "?moment=" + noras)).containsExactly(clip, alexs, mias, noras);
        assertThat(wall(nora, circle, "?moment=" + noras + "&by=" + mia)).containsExactly(mias);
        assertThat(wall(alex, circle, "?moment=" + clip)).containsExactly(clip, alexOnly, alexs, mias, noras);

        // One person's day is a moment of its own, named by the day.
        String day = fetch("/v1/library/" + thursday + "/moment", alex);
        assertThat(JsonPath.<String>read(day, "$.title")).isEqualTo("Thursday");
        assertThat(JsonPath.<Boolean>read(day, "$.shared")).isFalse();

        // It becomes an album: everything of the moment the person may see.
        String album = album(nora, circle, "The lake", ",\"momentOf\":\"%s\",\"audience\":\"circle\"".formatted(mias));
        assertThat(JsonPath.<Integer>read(fetch("/v1/albums/" + album, nora), "$.count"))
                .isEqualTo(4);
        assertThat(wall(alex, circle, "?album=" + album)).containsExactly(clip, alexs, mias, noras);

        // A document has no moment.
        send(HttpMethod.GET, "/v1/library/" + document(nora, circle, "Lease", "", "") + "/moment", nora, null, 404);
    }

    // ---------- one photo ----------

    @Test
    void aPhotoShowsWhoIsInItItsAlbumsItsHeartsAndWhatStandsEitherSideOfIt() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        String alexId = join(nora, circle, alex);
        String mia = addMember(nora, circle, "Mia", "child");
        List<String> lake = new ArrayList<>();
        for (int minute = 10; minute <= 50; minute += 10) {
            lake.add(
                    photo(nora, circle, "2026-11-07T10:%d:00+01:00".formatted(minute), ",\"placeName\":\"Lake Bled\""));
        }
        String earlier = photo(nora, circle, "2026-11-01T10:00:00+01:00", "");
        String middle = lake.get(2);
        send(HttpMethod.PUT, "/v1/things/" + middle + "/about", nora, "{\"memberIds\":[\"%s\"]}".formatted(mia), 204);
        String album = album(nora, circle, "Lake", ",\"itemIds\":%s".formatted(list(middle, lake.get(0), earlier)));
        String fills = album(nora, circle, "Mia", ",\"personId\":\"%s\"".formatted(mia));

        // In the wall's order: the two taken after it and the two before, the nearest first on each side.
        String onWall = fetch("/v1/library/" + middle, nora);
        assertThat(JsonPath.<List<String>>read(onWall, "$.neighbours.newer[*].id"))
                .containsExactly(lake.get(3), lake.get(4));
        assertThat(JsonPath.<List<String>>read(onWall, "$.neighbours.older[*].id"))
                .containsExactly(lake.get(1), lake.get(0), earlier);
        assertThat(JsonPath.<Object>read(onWall, "$.neighbours.position")).isNull();
        assertThat(JsonPath.<List<String>>read(onWall, "$.about[*].name")).containsExactly("Mia");
        assertThat(JsonPath.<List<String>>read(onWall, "$.albums[*].title")).containsExactly("Lake", "Mia");

        // Inside its moment: "3 of 5", and swiping stops at the moment's ends.
        String inMoment = fetch("/v1/library/" + middle + "?moment=" + middle, nora);
        assertThat(JsonPath.<Integer>read(inMoment, "$.neighbours.position")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(inMoment, "$.neighbours.total")).isEqualTo(5);
        String oldest = fetch("/v1/library/" + lake.get(0) + "?moment=" + middle, nora);
        assertThat(JsonPath.<List<String>>read(oldest, "$.neighbours.older[*].id"))
                .isEmpty();
        assertThat(JsonPath.<Integer>read(oldest, "$.neighbours.position")).isEqualTo(5);

        // Inside an album: only what is in it.
        String inAlbum = fetch("/v1/library/" + middle + "?album=" + album, nora);
        assertThat(JsonPath.<List<String>>read(inAlbum, "$.neighbours.newer[*].id"))
                .isEmpty();
        assertThat(JsonPath.<List<String>>read(inAlbum, "$.neighbours.older[*].id"))
                .containsExactly(lake.get(0), earlier);
        assertThat(JsonPath.<Integer>read(inAlbum, "$.neighbours.position")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(inAlbum, "$.neighbours.total")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(
                        fetch("/v1/library/" + middle + "?album=" + fills, nora), "$.neighbours.total"))
                .isEqualTo(1);

        // A heart is one member's: hers, his, and one she gives for the child. Nobody gives one for another adult.
        send(HttpMethod.PUT, "/v1/library/" + middle + "/love", nora, null, 204);
        send(HttpMethod.PUT, "/v1/library/" + middle + "/love", nora, null, 204);
        send(HttpMethod.PUT, "/v1/library/" + middle + "/love", alex, null, 204);
        send(HttpMethod.PUT, "/v1/library/" + middle + "/love?as=" + mia, nora, null, 204);
        send(HttpMethod.PUT, "/v1/library/" + middle + "/love?as=" + alexId, nora, null, 403);
        String loved = fetch("/v1/library/" + middle, alex);
        assertThat(JsonPath.<Integer>read(loved, "$.loves")).isEqualTo(3);
        assertThat(JsonPath.<List<String>>read(loved, "$.lovedBy[*].name")).containsExactly("Nora", "Alex", "Mia");
        assertThat(JsonPath.<Boolean>read(loved, "$.item.loved")).isTrue();
        send(HttpMethod.DELETE, "/v1/library/" + middle + "/love", alex, null, 204);
        String after = fetch("/v1/library/" + middle, alex);
        assertThat(JsonPath.<Integer>read(after, "$.loves")).isEqualTo(2);
        assertThat(JsonPath.<Boolean>read(after, "$.item.loved")).isFalse();
    }

    @Test
    void anyoneWhoSeesAPhotoMaySaySomethingUnderItOnce() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "crew", "Lisbon crew");
        join(nora, circle, alex);
        join(nora, circle, kai);
        String photo = photo(nora, circle, "2026-11-07T10:00:00+01:00", "");
        String body = "{\"clientId\":\"%s\",\"body\":\"  She did so well!  \"}".formatted(id());

        String first = send(HttpMethod.POST, "/v1/library/" + photo + "/comments", alex, body, 201);
        String second = send(HttpMethod.POST, "/v1/library/" + photo + "/comments", alex, body, 201);
        String kais = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/library/" + photo + "/comments",
                        kai,
                        "{\"clientId\":\"%s\",\"body\":\"Next time I'm coming\"}".formatted(id()),
                        201),
                "$.id");

        assertThat(JsonPath.<String>read(second, "$.id")).isEqualTo(JsonPath.<String>read(first, "$.id"));
        assertThat(JsonPath.<String>read(first, "$.body")).isEqualTo("She did so well!");
        String said = fetch("/v1/library/" + photo + "/comments", kai);
        assertThat(JsonPath.<List<String>>read(said, "$.items[*].by.name")).containsExactly("Alex", "Kai");
        assertThat(JsonPath.<List<Boolean>>read(said, "$.items[*].canRemove")).containsExactly(false, true);
        assertThat(JsonPath.<Integer>read(fetch("/v1/library/" + photo, nora), "$.comments"))
                .isEqualTo(2);
        send(
                HttpMethod.POST,
                "/v1/library/" + photo + "/comments",
                alex,
                "{\"clientId\":\"%s\",\"body\":\" \"}".formatted(id()),
                400);

        // Whoever wrote it removes it, and so does the photo's owner. Removing what is gone is fine.
        String alexs = JsonPath.read(first, "$.id");
        send(HttpMethod.DELETE, "/v1/library/comments/" + alexs, kai, null, 403);
        send(HttpMethod.DELETE, "/v1/library/comments/" + alexs, alex, null, 204);
        send(HttpMethod.DELETE, "/v1/library/comments/" + alexs, alex, null, 204);
        send(HttpMethod.DELETE, "/v1/library/comments/" + kais, nora, null, 204);
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/library/" + photo + "/comments", nora), "$.items"))
                .isEmpty();
    }

    // ---------- many at once ----------

    @Test
    void selectingManySharesHidesAndDeletesOnlyWhatIsYoursAndSaysHowMany() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        String alexId = join(nora, circle, alex);
        String one = photo(nora, circle, "2026-11-07T10:00:00+01:00", "");
        String two = photo(nora, circle, "2026-11-07T10:10:00+01:00", "");
        String scan = document(nora, circle, "Lease", "", "");
        String his = photo(alex, circle, "2026-11-07T10:20:00+01:00", ",\"audience\":\"circle\"");
        String page = page(nora, circle, "Not a photo", "me");
        String gone = id();
        String all = list(one, two, scan, his, page, gone);

        // Share: done to her three; his, the page and the one that isn't there are left alone.
        String shared = send(
                HttpMethod.POST,
                "/v1/library/select/share",
                nora,
                "{\"ids\":%s,\"audience\":\"circle\",\"everyoneEdits\":false}".formatted(all),
                200);
        assertThat(JsonPath.<Integer>read(shared, "$.applied")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(shared, "$.skipped")).isEqualTo(3);
        assertThat(wall(alex, circle, "")).containsExactly(his, two, one);
        assertThat(status("/v1/documents/" + scan, alex)).isEqualTo(200);
        assertThat(status("/v1/pages/" + page, alex)).isEqualTo(404);
        send(HttpMethod.PATCH, "/v1/library/" + one, alex, "{\"title\":\"His now\"}", 403);

        // Alex can't share hers by selecting them, and people have to be of the circle.
        assertThat(JsonPath.<Integer>read(
                        send(
                                HttpMethod.POST,
                                "/v1/library/select/share",
                                alex,
                                "{\"ids\":%s,\"audience\":\"me\"}".formatted(list(one, two)),
                                200),
                        "$.applied"))
                .isZero();
        send(
                HttpMethod.POST,
                "/v1/library/select/share",
                nora,
                "{\"ids\":%s,\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}"
                        .formatted(list(one), id()),
                400);

        // Hide from Alex: her shared ones go from his wall; "today" still counts as hidden.
        String hidden = send(
                HttpMethod.POST,
                "/v1/library/select/hide",
                nora,
                "{\"ids\":%s,\"memberId\":\"%s\",\"through\":\"%s\"}"
                        .formatted(list(one, scan, his), alexId, java.time.LocalDate.now()),
                200);
        assertThat(JsonPath.<Integer>read(hidden, "$.applied")).isEqualTo(2);
        assertThat(wall(alex, circle, "")).containsExactly(his, two);
        assertThat(status("/v1/library/" + one, alex)).isEqualTo(404);
        assertThat(status("/v1/documents/" + scan, alex)).isEqualTo(404);
        assertThat(JsonPath.<List<String>>read(fetch("/v1/library/" + one, nora), "$.item.chip.hiddenFrom"))
                .containsExactly("Alex");
        // What is only hers has nobody to hide it from.
        String onlyHers = photo(nora, circle, "2026-11-07T10:30:00+01:00", "");
        assertThat(JsonPath.<Integer>read(
                        send(
                                HttpMethod.POST,
                                "/v1/library/select/hide",
                                nora,
                                "{\"ids\":%s,\"memberId\":\"%s\"}".formatted(list(onlyHers), alexId),
                                200),
                        "$.applied"))
                .isZero();

        // Delete: hers go for good, with their files; his stays.
        int filesBefore = jdbc.sql("select count(*) from removed_files")
                .query(Integer.class)
                .single();
        String deleted = send(HttpMethod.POST, "/v1/library/select/delete", nora, "{\"ids\":%s}".formatted(all), 200);
        assertThat(JsonPath.<Integer>read(deleted, "$.applied")).isEqualTo(3);
        assertThat(wall(nora, circle, "")).containsExactly(onlyHers, his);
        assertThat(status("/v1/pages/" + page, nora)).isEqualTo(200);
        // Two photos, each with its original, and one file: five files to remove.
        assertThat(jdbc.sql("select count(*) from removed_files")
                                .query(Integer.class)
                                .single()
                        - filesBefore)
                .isEqualTo(5);
        assertThat(media.sweep()).isGreaterThanOrEqualTo(5);
        send(HttpMethod.POST, "/v1/library/select/delete", nora, "{\"ids\":[]}", 400);
    }

    @Test
    void deletingAPhotoTakesItsFilesWithItAndDeletingAnAccountTakesItsLibrary() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String hers = photo(nora, circle, "2026-11-07T10:00:00+01:00", ",\"audience\":\"circle\"");
        String clip = video(nora, circle, "2026-11-07T10:05:00+01:00", ",\"audience\":\"circle\"");
        String his = photo(alex, circle, "2026-11-07T10:10:00+01:00", ",\"audience\":\"circle\"");
        String fileUrl = JsonPath.read(fetch("/v1/library/" + hers, nora), "$.item.fileUrl");

        send(HttpMethod.DELETE, "/v1/things/" + hers, alex, null, 403);
        send(HttpMethod.DELETE, "/v1/things/" + hers, nora, null, 204);
        media.sweep();

        assertThat(mvc.perform(get(URI.create(fileUrl)))
                        .andReturn()
                        .getResponse()
                        .getStatus())
                .isEqualTo(404);
        assertThat(wall(alex, circle, "")).containsExactly(his, clip);

        send(HttpMethod.DELETE, "/v1/me", nora, null, 200);
        assertThat(wall(alex, circle, "")).containsExactly(his);
        assertThat(jdbc.sql("select count(*) from library_items")
                        .query(Integer.class)
                        .single())
                .isEqualTo(1);
        assertThat(jdbc.sql("select count(*) from media where kind <> 'photo' or has_sizes")
                        .query(Integer.class)
                        .single())
                .as("only Alex's photo is left")
                .isEqualTo(1);
    }
}
