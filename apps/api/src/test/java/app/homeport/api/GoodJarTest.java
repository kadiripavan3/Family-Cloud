package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * The good things jar, tried as three people: nobody reads another person's slip until New Year's Eve of its
 * year, and then everyone who sees the jar reads them all.
 */
class GoodJarTest extends BoardTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);
    // On the last two days of the year the jar really is open (or a phone a day ahead may say so): nothing to hide
    // then.
    private static final boolean FAR_FROM_NEW_YEARS_EVE = TODAY.isBefore(LocalDate.of(TODAY.getYear(), 12, 30));
    private static final String NORAS = "Pancakes that were actually round";
    private static final String ALEXS = "Nobody there but the sea";

    @Test
    void nobodyReadsTheOthersSlipsUntilNewYearsEveAndThenTheJarOpensToEveryone() throws Exception {
        String nora = person("Nora");
        String alex = person("Alex");
        String kai = person("Kai");
        String circle = circle(nora, "crew", "Lisbon crew");
        join(nora, circle, alex);
        join(nora, circle, kai);
        String leo = addMember(nora, circle, "Leo", "child");
        String jar = board(nora, circle, "good_jar", null, null);

        String hers = add(nora, jar, "slip", "{\"text\":\"%s\"}".formatted(NORAS));
        add(alex, jar, "slip", "{\"text\":\"%s\",\"place\":\"Reine\",\"fromJourney\":true}".formatted(ALEXS));
        add(
                nora,
                jar,
                "slip",
                "{\"text\":\"Leo drew all of us\",\"what\":\"drawing\",\"fromMemberId\":\"%s\",\"mediaId\":\"%s\"}"
                        .formatted(leo, uploadPhoto(nora)));

        // Everyone sees that the slips are there, whose they are and when they went in. Each reads only their own.
        if (FAR_FROM_NEW_YEARS_EVE) {
            for (String who : List.of(alex, kai)) {
                assertNowhere(who, circle, jar, NORAS);
                assertNowhere(who, circle, jar, "Leo drew all of us");
            }
            assertNowhere(nora, circle, jar, ALEXS);
            assertNowhere(kai, circle, jar, ALEXS);
            String kais = view(kai, jar);
            assertThat(kais).doesNotContain("/media/photos");
            assertThat(JsonPath.<Integer>read(kais, "$.view.count")).isEqualTo(3);
            assertThat(JsonPath.<String>read(kais, "$.view.opensOn")).isEqualTo(TODAY.getYear() + "-12-31");
            assertThat(JsonPath.<Boolean>read(kais, "$.view.open")).isFalse();
            // Newest first: Leo's drawing, Alex's from Reine, Nora's.
            assertThat(JsonPath.<List<String>>read(kais, "$.view.latest[*].who.name"))
                    .containsExactly("Leo", "Alex", "Nora");
            assertThat(JsonPath.<List<String>>read(kais, "$.view.latest[*].what"))
                    .containsExactly("drawing", "note", "note");
            assertThat(JsonPath.<List<Boolean>>read(kais, "$.view.latest[*].sealed"))
                    .containsExactly(true, true, true);
            assertThat(JsonPath.<String>read(kais, "$.view.latest[1].place")).isEqualTo("Reine");
            assertThat(JsonPath.<Boolean>read(kais, "$.view.latest[1].fromJourney"))
                    .isTrue();
            String noras = view(nora, jar);
            assertThat(JsonPath.<List<Boolean>>read(noras, "$.view.latest[*].sealed"))
                    .containsExactly(false, true, false);
            assertThat(JsonPath.<String>read(noras, "$.view.latest[2].text")).isEqualTo(NORAS);
            assertThat(JsonPath.<String>read(noras, "$.view.latest[0].picture.url"))
                    .contains("/media/photos");
            assertThat(fetch("/v1/circles/" + circle + "/search?q=Pancakes", nora))
                    .contains(jar);
            assertThat(JsonPath.<String>read(fetch("/v1/things/" + jar, kai), "$.glance"))
                    .isEqualTo("3 good things · opens 31 Dec");
            // A phone that says it is New Year's Eve opens nothing.
            assertThat(fetch("/v1/boards/" + jar + "?day=" + TODAY.getYear() + "-12-31", kai))
                    .doesNotContain(NORAS);
        }

        // Only the person who wrote a slip down changes it or takes it out; it can't be dated back.
        change(alex, hers, "{\"text\":\"Rewritten\"}", 403);
        send(HttpMethod.DELETE, "/v1/board-entries/" + hers, alex, null, 403);
        change(nora, hers, "{\"place\":\"Our kitchen\"}", 200);
        add(nora, jar, "slip", "{\"text\":\"Backdated\",\"day\":\"2000-01-01\"}");
        assertThat(jdbc.sql("select count(*) from board_entries where day <> :today")
                        .param("today", TODAY)
                        .query(Integer.class)
                        .single())
                .isZero();
        assertThat(add(nora, jar, "slip", "{}", 400)).contains("Write the good thing, or add a picture of it");
        add(nora, jar, "slip", "{\"text\":\"x\",\"what\":\"sculpture\"}", 400);

        // A year passes: these slips are last year's now, and last year's jar opened on its 31 December.
        jdbc.sql("update board_entries set day = cast(day - interval '1 year' as date)")
                .update();
        add(kai, jar, "slip", "{\"text\":\"Zebras on the first of January\"}");
        for (String who : List.of(nora, alex, kai)) {
            String lastYear = fetch("/v1/boards/" + jar + "?show=" + (TODAY.getYear() - 1), who);
            assertThat(JsonPath.<Boolean>read(lastYear, "$.view.open")).isTrue();
            assertThat(JsonPath.<Integer>read(lastYear, "$.view.count")).isEqualTo(4);
            assertThat(JsonPath.<List<String>>read(lastYear, "$.view.latest[*].text"))
                    .contains(NORAS, ALEXS, "Leo drew all of us");
            assertThat(JsonPath.<List<Boolean>>read(lastYear, "$.view.latest[*].sealed"))
                    .containsOnly(false);
            assertThat(JsonPath.<List<String>>read(
                            fetch("/v1/boards/" + jar + "/entries?filter=" + (TODAY.getYear() - 1), who),
                            "$.items[*].text"))
                    .hasSize(4)
                    .contains(ALEXS);
            assertThat(fetch("/v1/circles/" + circle + "/search?q=Nobody there", who))
                    .contains(jar);
        }
        // This year's jar is being filled again, and is as shut as the last one was.
        String thisYear = view(nora, jar);
        assertThat(JsonPath.<Integer>read(thisYear, "$.view.count")).isEqualTo(1);
        assertThat(JsonPath.<List<Integer>>read(thisYear, "$.view.years[*].year"))
                .containsExactly(TODAY.getYear() - 1);
        assertThat(JsonPath.<List<Integer>>read(thisYear, "$.view.years[*].count"))
                .containsExactly(4);
        if (FAR_FROM_NEW_YEARS_EVE) {
            assertNowhere(nora, circle, jar, "Zebras on the first of January");
        }
    }
}
