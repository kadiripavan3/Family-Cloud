package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * The time capsule, tried as three people: the writer, another adult, and the person it is for. Before the
 * day, what is sealed leaves the API for none of them, by any route; on the day it opens to those it is for.
 */
class TimeCapsuleTest extends BoardTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);
    private static final String SECRET = "Pineapple under the stairs";

    @Test
    void sealedMeansSealedForEveryoneUntilTheDayAndThenItOpensToThoseItIsFor() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String kaiId = join(nora, circle, kai);
        send(HttpMethod.PATCH, "/v1/members/" + kaiId, nora, "{\"role\":\"teen\"}", 200);
        String capsule = board(
                nora,
                circle,
                "time_capsule",
                "circle",
                "{\"opensOn\":\"%s\",\"forMemberIds\":[\"%s\"]}".formatted(TODAY.plusYears(8), kaiId));

        // Nora seals a letter and a recording. Alex is still writing his.
        String letter =
                add(nora, capsule, "letter", "{\"text\":\"%s\",\"title\":\"A letter from Mum\"}".formatted(SECRET));
        add(nora, capsule, "voice", "{\"mediaId\":\"%s\"}".formatted(recording(nora, 134)));
        String draft = add(alex, capsule, "letter", "{\"text\":\"Half a walrus so far\",\"seal\":false}");

        // Sealed: nobody reads it, the writer included. All three see the same envelope.
        for (String who : List.of(nora, alex, kai)) {
            assertNowhere(who, circle, capsule, SECRET);
            String seen = view(who, capsule);
            assertThat(seen).doesNotContain("/media/audio");
            assertThat(JsonPath.<String>read(seen, "$.view.items[0].title")).isEqualTo("A letter from Mum");
            assertThat(JsonPath.<String>read(seen, "$.view.items[0].from.name")).isEqualTo("Nora");
            assertThat(JsonPath.<Boolean>read(seen, "$.view.items[0].sealed")).isTrue();
            assertThat(JsonPath.<Object>read(seen, "$.view.items[0].text")).isNull();
            assertThat(JsonPath.<Integer>read(seen, "$.view.items[0].pages")).isEqualTo(1);
            assertThat(JsonPath.<String>read(seen, "$.view.items[0].sealedAt")).isNotNull();
            assertThat(JsonPath.<String>read(seen, "$.view.items[1].title")).isEqualTo("A voice message from Nora");
            assertThat(JsonPath.<Integer>read(seen, "$.view.items[1].seconds")).isEqualTo(134);
            assertThat(JsonPath.<Object>read(seen, "$.view.items[1].media")).isNull();
            assertThat(JsonPath.<Boolean>read(seen, "$.view.open")).isFalse();
            assertThat(JsonPath.<Integer>read(seen, "$.view.sealedInside")).isEqualTo(2);
            // What is written on the outside can be found; it is there for everyone to read.
            assertThat(fetch("/v1/circles/" + circle + "/search?q=letter from Mum", who))
                    .contains(capsule);
        }
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + capsule, kai), "$.glance"))
                .isEqualTo("2 sealed inside · opens " + TODAY.plusYears(8).getDayOfMonth() + " "
                        + TODAY.plusYears(8)
                                .getMonth()
                                .getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.ENGLISH)
                        + " " + TODAY.plusYears(8).getYear());

        // A draft is its writer's alone: the others aren't even told it is there.
        assertThat(JsonPath.<String>read(view(alex, capsule), "$.view.items[2].text"))
                .isEqualTo("Half a walrus so far");
        assertThat(JsonPath.<Boolean>read(view(alex, capsule), "$.view.items[2].draft"))
                .isTrue();
        for (String who : List.of(nora, kai)) {
            assertNowhere(who, circle, capsule, "walrus");
            assertThat(JsonPath.<Integer>read(view(who, capsule), "$.view.items.length()"))
                    .isEqualTo(2);
        }
        change(nora, draft, "{\"text\":\"Rewritten by someone else\"}", 404);
        act(nora, capsule, "seal", "{\"entryId\":\"%s\"}".formatted(draft), 404);

        // Its writer changes it, then seals it. From then on he can't read or change it either.
        change(alex, draft, "{\"text\":\"A whole walrus\",\"title\":\"From Dad\"}", 200);
        act(alex, capsule, "seal", "{\"entryId\":\"%s\"}".formatted(draft), 200);
        assertNowhere(alex, circle, capsule, "walrus");
        assertThat(change(alex, draft, "{\"text\":\"One more line\"}", 409)).contains("Sealed means sealed");
        assertThat(change(nora, letter, "{\"text\":\"One more line\"}", 409)).contains("Sealed means sealed");

        // A phone that says it is 2099 opens nothing.
        assertThat(fetch("/v1/boards/" + capsule + "?day=2099-01-01", kai)).doesNotContain(SECRET);
        assertThat(fetch("/v1/boards/" + capsule + "/entries?day=2099-01-01&q=Pineapple", kai))
                .doesNotContain(SECRET);
        // And once something is sealed inside, the date can't be pulled forward, nor the capsule given to someone else.
        assertThat(send(
                        HttpMethod.PATCH,
                        "/v1/boards/" + capsule,
                        nora,
                        "{\"settings\":{\"opensOn\":\"%s\"}}".formatted(TODAY.plusDays(1)),
                        409))
                .contains("Something is sealed inside already");
        send(HttpMethod.PATCH, "/v1/boards/" + capsule, nora, "{\"settings\":{\"forMemberIds\":[]}}", 409);

        // The day comes. It is for Kai: he reads everything. The others still see envelopes.
        setSetting(capsule, "opensOn", TODAY.toString());
        String opened = view(kai, capsule);
        assertThat(JsonPath.<Boolean>read(opened, "$.view.openForYou")).isTrue();
        assertThat(JsonPath.<String>read(opened, "$.view.items[0].text")).isEqualTo(SECRET);
        assertThat(JsonPath.<Boolean>read(opened, "$.view.items[0].sealed")).isFalse();
        assertThat(JsonPath.<String>read(opened, "$.view.items[1].media.url")).contains("/media/audio");
        assertThat(JsonPath.<String>read(opened, "$.view.items[2].text")).isEqualTo("A whole walrus");
        assertThat(fetch("/v1/circles/" + circle + "/search?q=Pineapple", kai)).contains(capsule);
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/circles/" + circle + "/today?day=" + TODAY, kai), "$.items[*].note"))
                .containsExactly("The time capsule opens today");
        for (String who : List.of(nora, alex)) {
            assertNowhere(who, circle, capsule, SECRET);
            assertNowhere(who, circle, capsule, "walrus");
            assertThat(JsonPath.<Boolean>read(view(who, capsule), "$.view.open"))
                    .isTrue();
            assertThat(JsonPath.<Boolean>read(view(who, capsule), "$.view.openForYou"))
                    .isFalse();
        }
        // An opened capsule takes nothing more.
        assertThat(add(nora, capsule, "letter", "{\"text\":\"Too late\"}", 409)).contains("This capsule has opened");
    }

    @Test
    void aCapsuleForAChildWithoutASignInOpensOnThePhonesOfTheAdultsWhoLookAfterThem() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String kaiId = join(nora, circle, kai);
        send(HttpMethod.PATCH, "/v1/members/" + kaiId, nora, "{\"role\":\"teen\"}", 200);
        String mia = addMember(nora, circle, "Mia", "child");
        String capsule = board(
                nora,
                circle,
                "time_capsule",
                "circle",
                "{\"opensOn\":\"%s\",\"forMemberIds\":[\"%s\"]}".formatted(TODAY.plusDays(30), mia));
        add(alex, capsule, "letter", "{\"text\":\"%s\"}".formatted(SECRET));
        assertThat(JsonPath.<List<String>>read(view(nora, capsule), "$.view.forPeople[*].name"))
                .containsExactly("Mia");

        setSetting(capsule, "opensOn", TODAY.minusDays(1).toString());

        // Both parents read it with her; her teenage brother, who can see the capsule, does not.
        assertThat(JsonPath.<String>read(view(nora, capsule), "$.view.items[0].text"))
                .isEqualTo(SECRET);
        assertThat(JsonPath.<String>read(view(alex, capsule), "$.view.items[0].text"))
                .isEqualTo(SECRET);
        assertNowhere(kai, circle, capsule, SECRET);
        assertThat(JsonPath.<Boolean>read(view(kai, capsule), "$.view.items[0].sealed"))
                .isTrue();
    }

    @Test
    void aSurpriseCapsuleIsHiddenFromThePersonItIsForUntilTheDayItOpens() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "family", "The Linds");
        join(nora, circle, alex);
        String kaiId = join(nora, circle, kai);
        String capsule = board(
                nora,
                circle,
                "time_capsule",
                "circle",
                "{\"opensOn\":\"%s\",\"forMemberIds\":[\"%s\"],\"hideFromThem\":true}"
                        .formatted(TODAY.plusYears(2), kaiId));
        add(nora, capsule, "letter", "{\"text\":\"%s\"}".formatted(SECRET));

        // The chip says who it is kept from; Alex sees the capsule, Kai doesn't know it exists.
        assertThat(JsonPath.<List<String>>read(view(alex, capsule), "$.chip.hiddenFrom"))
                .containsExactly("Kai");
        assertThat(statusOf("/v1/boards/" + capsule, kai)).isEqualTo(404);
        assertThat(statusOf("/v1/things/" + capsule, kai)).isEqualTo(404);
        assertThat(fetch("/v1/circles/" + circle + "/boards", kai)).doesNotContain(capsule);
        assertThat(fetch("/v1/circles/" + circle + "/search?q=Time capsule", kai))
                .doesNotContain(capsule);
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/things/" + capsule + "/audience", nora),
                        "$.people[?(@.memberId == '" + kaiId + "')].hiddenThrough"))
                .containsExactly(TODAY.plusYears(2).minusDays(1).toString());

        // The day: the hiding ended the evening before, and the capsule opens to him.
        setSetting(capsule, "opensOn", TODAY.toString());
        jdbc.sql("update thing_hides set through = :yesterday")
                .param("yesterday", TODAY.minusDays(1))
                .update();
        assertThat(JsonPath.<String>read(view(kai, capsule), "$.view.items[0].text"))
                .isEqualTo(SECRET);
        assertThat(fetch("/v1/circles/" + circle + "/today?day=" + TODAY, kai))
                .contains("The time capsule opens today");

        // One that is only its maker's has nobody to be hidden from, and stays simply hers.
        String own = newBoard(
                nora,
                circle,
                "time_capsule",
                null,
                "{\"opensOn\":\"%s\",\"forMemberIds\":[\"%s\"],\"hideFromThem\":true}"
                        .formatted(TODAY.plusYears(2), kaiId),
                201);
        assertThat(JsonPath.<String>read(own, "$.chip.audience")).isEqualTo("me");
        assertThat(JsonPath.<List<String>>read(own, "$.chip.hiddenFrom")).isEmpty();
    }

    @Test
    void aCapsuleForNobodyInParticularOpensToEveryoneAndABundleOfPhotosIsSealedFromTheStart() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String circle = circle(nora, "couple", "Nora and Alex");
        join(nora, circle, alex);
        String capsule =
                board(nora, circle, "time_capsule", null, "{\"opensOn\":\"%s\"}".formatted(TODAY.plusYears(1)));
        String bundle =
                add(nora, capsule, "photos", "{\"title\":\"12 photos from this year\",\"note\":\"One a month\"}");
        add(nora, capsule, "photo", "{\"parentId\":\"%s\",\"mediaId\":\"%s\"}".formatted(bundle, uploadPhoto(nora)));
        add(alex, capsule, "photo", "{\"parentId\":\"%s\",\"mediaId\":\"%s\"}".formatted(bundle, uploadPhoto(alex)));
        String recipe = add(
                nora,
                capsule,
                "photo",
                "{\"title\":\"Grandma Astrid's cookie recipe\",\"fromName\":\"Astrid Lind\",\"mediaId\":\"%s\"}"
                        .formatted(uploadPhoto(nora)));

        // Sealed: a count, no pictures, for both of them.
        for (String who : List.of(nora, alex)) {
            String seen = view(who, capsule);
            assertThat(seen).doesNotContain("/media/photos");
            assertThat(JsonPath.<Integer>read(seen, "$.view.items[0].photos")).isEqualTo(2);
            assertThat(JsonPath.<List<Object>>read(seen, "$.view.items[0].pictures"))
                    .isEmpty();
            assertThat(JsonPath.<String>read(seen, "$.view.items[1].fromName")).isEqualTo("Astrid Lind");
            assertThat(JsonPath.<Object>read(seen, "$.view.items[1].from")).isNull();
            assertThat(JsonPath.<Integer>read(seen, "$.view.progress")).isZero();
        }
        // Someone who can change the capsule can't take out what another person put in; its writer and its maker can.
        send(HttpMethod.DELETE, "/v1/board-entries/" + recipe, alex, null, 403);
        send(HttpMethod.DELETE, "/v1/board-entries/" + recipe, nora, null, 204);
        // An upload of the wrong kind, or someone else's upload, can't be put in.
        add(nora, capsule, "voice", "{\"mediaId\":\"%s\"}".formatted(uploadPhoto(nora)), 400);
        add(alex, capsule, "photo", "{\"mediaId\":\"%s\"}".formatted(uploadPhoto(nora)), 400);
        add(nora, capsule, "letter", "{}", 400);

        setSetting(capsule, "opensOn", TODAY.toString());
        setSetting(capsule, "countFrom", TODAY.minusDays(10).toString());
        String opened = view(alex, capsule);
        assertThat(JsonPath.<Boolean>read(opened, "$.view.openForYou")).isTrue();
        assertThat(JsonPath.<Integer>read(opened, "$.view.items[0].pictures.length()"))
                .isEqualTo(2);
        assertThat(JsonPath.<Integer>read(opened, "$.view.progress")).isEqualTo(100);
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + capsule, alex), "$.glance"))
                .startsWith("Opened ");

        // When the capsule goes, its files go with it: their records are deleted, and the files queued for removal.
        int before = jdbc.sql("select count(*) from media").query(Integer.class).single();
        send(HttpMethod.DELETE, "/v1/things/" + capsule, nora, null, 204);
        assertThat(jdbc.sql("select count(*) from media").query(Integer.class).single())
                .isEqualTo(before - 2);
    }
}
