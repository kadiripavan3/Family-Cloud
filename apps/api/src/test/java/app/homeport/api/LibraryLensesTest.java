package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** The other ways of looking at the wall: by year and month, by person, by place, by how much room it takes, and what is new. */
class LibraryLensesTest extends LibraryApiTest {

    @Test
    void theStripAtTheSideCountsEveryYearAndMonthAndOneYearOpensWithItsNewestPictures() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        String alexId = join(nora, circle, alex);
        String nov1 = photo(nora, circle, "2026-11-07T11:42:00+01:00", "");
        String nov2 = photo(nora, circle, "2026-11-05T19:40:00+01:00", "");
        String novClip = video(alex, circle, "2026-11-07T11:20:00+01:00", "");
        String aug = photo(alex, circle, "2026-08-14T11:05:00+08:00", "");
        // Taken at ten to midnight on New Year's Eve in Sydney: it is last year's there, whatever the clock says here.
        String newYear = photo(nora, circle, "2025-12-31T23:50:00+11:00", "");
        String old = photo(nora, circle, "2019-09-24T06:40:00+03:00", "");
        document(nora, circle, "Lease", "", "");
        String alexOnly = photo(alex, circle, "2026-11-01T10:00:00+01:00", ",\"audience\":\"me\"");

        String timeline = fetch("/v1/circles/" + circle + "/library/timeline?tiles=2", nora);
        assertThat(JsonPath.<List<Integer>>read(timeline, "$.years[*].year")).containsExactly(2026, 2025, 2019);
        assertThat(JsonPath.<List<Integer>>read(timeline, "$.years[*].photos")).containsExactly(3, 1, 1);
        assertThat(JsonPath.<List<Integer>>read(timeline, "$.years[*].videos")).containsExactly(1, 0, 0);
        assertThat(JsonPath.<Integer>read(timeline, "$.year")).isEqualTo(2026);
        assertThat(JsonPath.<List<String>>read(timeline, "$.months[*].month")).containsExactly("2026-11", "2026-08");
        assertThat(JsonPath.<List<Integer>>read(timeline, "$.months[*].photos")).containsExactly(2, 1);
        assertThat(JsonPath.<List<Integer>>read(timeline, "$.months[*].videos")).containsExactly(1, 0);
        // The newest two of November, the newest first; a video shows its still.
        assertThat(JsonPath.<List<String>>read(timeline, "$.months[0].tiles[*].id"))
                .containsExactly(nov1, novClip);
        assertThat(JsonPath.<List<String>>read(timeline, "$.months[0].tiles[*].kind"))
                .containsExactly("photo", "video");
        assertThat(JsonPath.<String>read(timeline, "$.months[0].tiles[1].thumbUrl"))
                .contains("/photos/");
        assertThat(JsonPath.<List<String>>read(timeline, "$.months[1].tiles[*].id"))
                .containsExactly(aug);

        // Another year opened, and the wall jumped there.
        String earlier = fetch("/v1/circles/" + circle + "/library/timeline?year=2025", nora);
        assertThat(JsonPath.<List<String>>read(earlier, "$.months[*].month")).containsExactly("2025-12");
        assertThat(JsonPath.<List<String>>read(earlier, "$.months[0].tiles[*].id"))
                .containsExactly(newYear);
        assertThat(wall(nora, circle, "?until=2025-12-31")).containsExactly(newYear, old);
        assertThat(JsonPath.<List<Object>>read(
                        fetch("/v1/circles/" + circle + "/library/timeline?year=2020", nora), "$.months"))
                .isEmpty();

        // The same narrowing as the wall: only videos, only what Alex added. He counts his private one too.
        assertThat(JsonPath.<List<Integer>>read(
                        fetch("/v1/circles/" + circle + "/library/timeline?kind=video", nora), "$.years[*].year"))
                .containsExactly(2026);
        String byAlex = fetch("/v1/circles/" + circle + "/library/timeline?by=" + alexId, nora);
        assertThat(JsonPath.<List<String>>read(byAlex, "$.months[*].month")).containsExactly("2026-11", "2026-08");
        assertThat(JsonPath.<Integer>read(byAlex, "$.months[0].photos")).isZero();
        assertThat(JsonPath.<Integer>read(
                        fetch("/v1/circles/" + circle + "/library/timeline?tiles=0", alex), "$.years[0].photos"))
                .isEqualTo(4);
        assertThat(alexOnly).isNotEqualTo(nov2);
        // Nothing yet: no years, and no year to open.
        String empty = fetch("/v1/circles/" + circle(nora, "solo", "Just me") + "/library/timeline", nora);
        assertThat(JsonPath.<List<Object>>read(empty, "$.years")).isEmpty();
        assertThat(JsonPath.<Object>read(empty, "$.year")).isNull();
    }

    @Test
    void placesAndPeopleAreCountedFromWhatTheViewerMaySee() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String mia = addMember(nora, circle, "Mia", "child");
        String dog = addMember(nora, circle, "Biscuit", "pet");
        String lake =
                ",\"lat\":46.3625,\"lng\":14.0938,\"placeName\":\"Lake Bled\",\"country\":\"Slovenia\",\"audience\":\"circle\"";
        String newest = photo(nora, circle, "2026-11-07T11:42:00+01:00", lake + ",\"about\":[\"%s\"]".formatted(mia));
        video(alex, circle, "2026-11-07T11:20:00+01:00", lake);
        photo(
                alex,
                circle,
                "2025-06-21T14:15:00+02:00",
                ",\"placeName\":\"lake bled\",\"country\":\"Slovenia\",\"audience\":\"circle\"");
        photo(
                nora,
                circle,
                "2019-09-24T06:40:00+03:00",
                ",\"placeName\":\"Cappadocia\",\"country\":\"Türkiye\",\"about\":[\"%s\",\"%s\"]".formatted(mia, dog));
        photo(
                nora,
                circle,
                "2026-11-05T19:40:00+01:00",
                ",\"audience\":\"circle\""); // no place: on the wall, not on the map
        String newestUrl = JsonPath.read(fetch("/v1/library/" + newest, nora), "$.item.url");

        String places = fetch("/v1/circles/" + circle + "/library/places", nora);
        assertThat(JsonPath.<Integer>read(places, "$.places")).isEqualTo(2);
        assertThat(JsonPath.<Integer>read(places, "$.countries")).isEqualTo(2);
        assertThat(JsonPath.<List<String>>read(places, "$.list[*].name")).containsExactly("Lake Bled", "Cappadocia");
        assertThat(JsonPath.<Integer>read(places, "$.list[0].count")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(places, "$.list[0].photos")).isEqualTo(2);
        assertThat(JsonPath.<Integer>read(places, "$.list[0].videos")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(places, "$.list[0].visits")).isEqualTo(2);
        assertThat(JsonPath.<String>read(places, "$.list[0].lastDay")).isEqualTo("2026-11-07");
        assertThat(JsonPath.<String>read(places, "$.list[0].country")).isEqualTo("Slovenia");
        assertThat(JsonPath.<Double>read(places, "$.list[0].lat")).isEqualTo(46.3625);
        assertThat(JsonPath.<String>read(places, "$.list[0].coverUrl")).isEqualTo(newestUrl);
        assertThat(JsonPath.<List<String>>read(places, "$.list[0].people[*].name"))
                .containsExactly("Alex", "Nora");
        assertThat(JsonPath.<Object>read(places, "$.list[1].lat")).isNull();
        assertThat(wall(nora, circle, "?place=Lake Bled")).hasSize(3);
        // Alex doesn't see Cappadocia: it is Nora's alone.
        String forAlex = fetch("/v1/circles/" + circle + "/library/places", alex);
        assertThat(JsonPath.<List<String>>read(forAlex, "$.list[*].name")).containsExactly("Lake Bled");
        assertThat(JsonPath.<Integer>read(forAlex, "$.countries")).isEqualTo(1);

        String lenses = fetch("/v1/circles/" + circle + "/library/lenses", nora);
        assertThat(JsonPath.<Integer>read(lenses, "$.photos")).isEqualTo(4);
        assertThat(JsonPath.<Integer>read(lenses, "$.videos")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(lenses, "$.files")).isZero();
        assertThat(JsonPath.<Integer>read(lenses, "$.places")).isEqualTo(2);
        assertThat(JsonPath.<List<String>>read(lenses, "$.people[*].name")).containsExactly("Mia", "Biscuit");
        assertThat(JsonPath.<List<Integer>>read(lenses, "$.people[*].count")).containsExactly(2, 1);
        assertThat(JsonPath.<String>read(lenses, "$.people[0].coverUrl")).isEqualTo(newestUrl);
        String hisLenses = fetch("/v1/circles/" + circle + "/library/lenses", alex);
        assertThat(JsonPath.<List<String>>read(hisLenses, "$.people[*].name")).containsExactly("Mia");
        assertThat(JsonPath.<List<Integer>>read(hisLenses, "$.people[*].count")).containsExactly(1);
    }

    @Test
    void storageSaysHowMuchTheCircleKeepsByKindAndByWhoAddedIt() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String mia = addMember(nora, circle, "Mia", "child");
        long hers = kept(nora, photo(nora, circle, "2026-11-07T11:42:00+01:00", ""));
        long mias = kept(nora, photo(nora, circle, "2026-11-07T11:40:00+01:00", ",\"addedBy\":\"%s\"".formatted(mia)));
        long clip = kept(alex, video(alex, circle, "2026-11-07T11:20:00+01:00", ""));
        long lease = kept(alex, document(alex, circle, "Lease", "", ""));
        photo(
                nora,
                circle(nora, "solo", "Just me"),
                "2026-11-07T11:42:00+01:00",
                ""); // another circle: not counted here

        String storage = fetch("/v1/circles/" + circle + "/storage", nora);

        // A photo counts with its original, a video with its still, a file as it arrived.
        assertThat(JsonPath.<Number>read(storage, "$.photoBytes").longValue()).isEqualTo(hers + mias);
        assertThat(JsonPath.<Number>read(storage, "$.videoBytes").longValue()).isEqualTo(clip);
        assertThat(JsonPath.<Number>read(storage, "$.documentBytes").longValue())
                .isEqualTo(lease);
        assertThat(JsonPath.<Number>read(storage, "$.otherBytes").longValue()).isZero();
        assertThat(JsonPath.<Number>read(storage, "$.usedBytes").longValue()).isEqualTo(hers + mias + clip + lease);
        assertThat(JsonPath.<Number>read(storage, "$.quotaBytes").longValue()).isEqualTo(200L * 1024 * 1024 * 1024);
        assertThat(lease)
                .isEqualTo(jdbc.sql("select bytes from media where kind = 'file'")
                        .query(Long.class)
                        .single());
        assertThat(hers)
                .isEqualTo(jdbc.sql(
                                "select max(bytes + original_bytes) from media m join library_items i on i.media_id = m.id"
                                        + " where i.added_by is null and i.kind = 'photo' and i.circle_id = cast(:circle as uuid)")
                        .param("circle", circle)
                        .query(Long.class)
                        .single());
        // By person, the one with most first: Alex's video and file, Nora's photo, and Mia's from her tablet as Mia's.
        List<String> names = JsonPath.read(storage, "$.people[*].person.name");
        List<Number> bytes = JsonPath.read(storage, "$.people[*].bytes");
        assertThat(names).containsExactlyInAnyOrder("Alex", "Nora", "Mia");
        assertThat(bytes.get(names.indexOf("Alex")).longValue()).isEqualTo(clip + lease);
        assertThat(bytes.get(names.indexOf("Nora")).longValue()).isEqualTo(hers);
        assertThat(bytes.get(names.indexOf("Mia")).longValue()).isEqualTo(mias);
        assertThat(bytes.stream().map(Number::longValue).toList())
                .isSortedAccordingTo(java.util.Comparator.reverseOrder());
        assertThat(JsonPath.<List<Boolean>>read(storage, "$.people[?(@.person.name == 'Nora')].you"))
                .containsExactly(true);
        // Alex is told the same: it is the circle's room, whatever he can see of what fills it.
        assertThat(JsonPath.<Number>read(fetch("/v1/circles/" + circle + "/storage", alex), "$.usedBytes")
                        .longValue())
                .isEqualTo(hers + mias + clip + lease);
    }

    /** How much is kept for one thing, as its own screen says. */
    private long kept(String token, String id) throws Exception {
        return JsonPath.<Number>read(fetch("/v1/library/" + id, token), "$.bytes")
                .longValue();
    }

    @Test
    void todayBringsTheMomentsOthersAddedToTheDocumentsTheySharedAndTheAlbumsThatGrew() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String mia = addMember(nora, circle, "Mia", "child");
        String dog = addMember(nora, circle, "Biscuit", "pet");
        String lake = ",\"lat\":46.3625,\"lng\":14.0938,\"placeName\":\"Lake Bled\",\"audience\":\"circle\"";
        photo(nora, circle, "2026-11-07T09:12:00+01:00", lake);
        photo(nora, circle, "2026-11-07T10:05:00+01:00", lake + ",\"addedBy\":\"%s\"".formatted(mia));
        String early = photo(alex, circle, "2026-11-07T10:40:00+01:00", lake + ",\"about\":[\"%s\"]".formatted(dog));
        String newest = photo(alex, circle, "2026-11-07T11:42:00+01:00", lake + ",\"about\":[\"%s\"]".formatted(dog));
        photo(alex, circle, "2026-11-07T11:00:00+01:00", ",\"placeName\":\"Lake Bled\""); // his alone
        photo(nora, circle, "2026-11-05T19:40:00+01:00", ",\"audience\":\"circle\""); // hers: no news to her
        String recipe = JsonPath.read(
                addOne(
                        alex,
                        circle,
                        sendFile(alex, "photo", "image/jpeg", picture(), ""),
                        ",\"kind\":\"document\",\"title\":\"Grandma's cookies\",\"audience\":\"circle\",\"text\":\"Ingredients: butter, sugar\""),
                "$.items[0].item.id");
        String album = album(nora, circle, "Biscuit", ",\"personId\":\"%s\",\"audience\":\"circle\"".formatted(dog));
        String newestUrl = JsonPath.read(fetch("/v1/library/" + newest, nora), "$.item.url");

        String today = fetch("/v1/circles/" + circle + "/today", nora);

        assertThat(JsonPath.<List<String>>read(today, "$.fresh[*].thingId")).containsExactly(newest, recipe, album);
        assertThat(JsonPath.<List<String>>read(today, "$.fresh[*].kind")).containsExactly("photo", "document", "album");
        assertThat(JsonPath.<List<String>>read(today, "$.fresh[*].title"))
                .containsExactly("Saturday at Lake Bled", "Grandma's cookies", "Biscuit");
        assertThat(JsonPath.<List<String>>read(today, "$.fresh[*].note"))
                .containsExactly("Alex, Mia and you", "Alex added a scan", "2 new this week");
        assertThat(JsonPath.<List<String>>read(today, "$.fresh[*].pill")).containsExactly("2 new", "Recipe", null);
        assertThat(JsonPath.<String>read(today, "$.fresh[0].imageUrl")).isEqualTo(newestUrl);
        assertThat(JsonPath.<String>read(today, "$.fresh[1].imageUrl")).contains("/photos/");
        assertThat(JsonPath.<String>read(today, "$.fresh[2].imageUrl")).isEqualTo(newestUrl);

        // For Alex the news is what Nora added: two at the lake (one of them for Mia), and her Thursday.
        String his = fetch("/v1/circles/" + circle + "/today", alex);
        assertThat(JsonPath.<List<String>>read(his, "$.fresh[*].title"))
                .containsExactly("Saturday at Lake Bled", "Thursday");
        assertThat(JsonPath.<List<String>>read(his, "$.fresh[*].pill")).containsExactly("2 new", "1 new");
        assertThat(JsonPath.<List<String>>read(his, "$.fresh[*].note")).containsExactly("Nora, Mia and you", "Nora");
        // After a week it is no longer news.
        jdbc.sql("update library_items set created_at = now() - interval '8 days'")
                .update();
        jdbc.sql("update things set created_at = now() - interval '8 days', updated_at = now() - interval '8 days'")
                .update();
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/circles/" + circle + "/today", nora), "$.fresh"))
                .isEmpty();
        assertThat(early).isNotEqualTo(newest);
        send(HttpMethod.GET, "/v1/circles/" + circle + "/today", person("Stranger"), null, 404);
    }
}
