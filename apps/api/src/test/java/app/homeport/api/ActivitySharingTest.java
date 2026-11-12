package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Activity keeps the one sharing rule, at the moment of reading. Every way there is to read lines is tried
 * here (the list with each chip, the count behind the dot, what is due) as a stranger, as someone in the
 * circle a thing isn't shared with, and as someone it is hidden from, and they have to agree: a line about a
 * thing is there for exactly the people who may see that thing now.
 */
class ActivitySharingTest extends TiesTestBase {

    private static final String TODAY = LocalDate.now(java.time.ZoneId.of(ZONE)).toString();

    private String kai;
    private String kaiId;

    private void theLindsAndKai() throws Exception {
        theLinds();
        kai = person("Kai");
        kaiId = join(nora, circle, kai);
        quiet();
    }

    /** Every route that lists Activity, each as the plain sentences it holds for this person. */
    private List<String> everyWay(String token) throws Exception {
        List<String> all = new java.util.ArrayList<>();
        for (String chip : List.of("", "filter=all", "filter=asks", "filter=photos", "filter=money", "filter=plan")) {
            String answer = activity(token, chip.isEmpty() ? "day=" + TODAY : chip + "&day=" + TODAY);
            all.addAll(said(answer, "items"));
            all.addAll(said(answer, "due"));
        }
        return all;
    }

    private int dot(String token) throws Exception {
        return JsonPath.read(fetch("/v1/circles/" + circle + "/activity/unread", token), "$.fresh");
    }

    @Test
    void aStrangerLearnsNothingFromAnyRouteAndSomeoneInAnotherCircleNothingAboutThisOne() throws Exception {
        theLinds();
        String stranger = person("Stranger");
        String theirs = circle(stranger, "crew", "Others");
        page(nora, circle, "Packing", "circle");

        for (String path : List.of(
                "/activity", "/activity?filter=money", "/activity/unread", "/summary", "/leaving", "/exports")) {
            send(HttpMethod.GET, "/v1/circles/" + circle + path, stranger, null, 404);
        }
        send(HttpMethod.PUT, "/v1/circles/" + circle + "/activity/seen", stranger, null, 404);
        send(HttpMethod.PUT, "/v1/circles/" + circle + "/mute", stranger, "{\"muted\":true}", 404);
        // Their own circle's Activity holds nothing of the Linds'.
        assertThat(fetch("/v1/circles/" + theirs + "/activity", stranger)).doesNotContain("Packing");
    }

    @Test
    void aLineAboutAThingIsThereOnlyForThoseTheThingIsSharedWith() throws Exception {
        theLindsAndKai();
        String forAlex = page(nora, circle, "Plan for Kai's birthday", "me");
        audience(
                nora,
                forAlex,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(alexId));
        String list = checklist(nora, "Gift ideas", "me", "Skates");
        audience(
                nora,
                list,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"edit\"}]}".formatted(alexId));
        tick(nora, addLine(nora, list, "Candles"));
        bill(nora, "Party room", 12000, TODAY, ",\"audience\":\"me\"");

        // Alex: the two things shared with him, and Nora's changes to the list.
        assertThat(sentences(alex))
                .containsExactlyInAnyOrder(
                        "Nora changed Gift ideas", "Nora shared Gift ideas", "Nora shared Plan for Kai's birthday");
        assertThat(lines(alex))
                .contains(
                        "Nora changed Gift ideas | 1 thing added, 1 ticked",
                        "Nora shared Gift ideas | List · 1 of 2 done");
        assertThat(dot(alex)).isEqualTo(3);
        // Kai is in the circle and was shown none of it: no line, no count, nothing due, with any chip.
        assertThat(everyWay(kai)).isEmpty();
        assertThat(dot(kai)).isZero();
        // What is only Nora's (the bill) made no line at all, and is due for her alone.
        assertThat(jdbc.sql("select count(*) from activity a join things t on t.id = a.thing_id where t.kind = 'bill'")
                        .query(Integer.class)
                        .single())
                .isZero();
        assertThat(said(activity(nora, "day=" + TODAY), "due")).hasSize(1);
        assertThat(said(activity(alex, "day=" + TODAY), "due")).isEmpty();
    }

    @Test
    void aPlanHiddenFromSomeoneNeverShowsInTheirActivityAndComesBackTheDayAfter() throws Exception {
        theLindsAndKai();
        String party = checklist(nora, "Kai's party", "circle", "Cake");
        addLine(alex, party, "Balloons");
        assertThat(everyWay(kai)).isNotEmpty();

        // Hidden from Kai through tomorrow.
        audience(
                nora,
                party,
                "{\"audience\":\"circle\",\"hiddenFrom\":[{\"memberId\":\"%s\",\"through\":\"%s\"}]}"
                        .formatted(kaiId, LocalDate.now().plusDays(1)));
        tick(alex, addLine(alex, party, "Candles"));

        assertThat(everyWay(kai)).isEmpty();
        assertThat(dot(kai)).isZero();
        assertThat(lines(nora)).contains("Alex changed Kai's party | 2 things added, 1 ticked");

        // The day after, the hiding is over: the lines are his to read, as the thing is.
        jdbc.sql("update thing_hides set through = current_date - 1").update();
        assertThat(lines(kai)).contains("Alex changed Kai's party | 2 things added, 1 ticked");
    }

    @Test
    void aThingTakenBackDisappearsFromEveryoneElsesActivityAndADeletedOneFromEveryones() throws Exception {
        theLindsAndKai();
        String page = page(nora, circle, "House rules", "circle");
        String list = checklist(alex, "Groceries", "circle", "Milk");
        assertThat(lines(kai)).hasSize(2);
        assertThat(dot(kai)).isEqualTo(2);

        audience(nora, page, "{\"audience\":\"me\"}");

        assertThat(lines(kai)).containsExactly("Alex added Groceries | List · 0 of 1 done");
        assertThat(lines(alex)).isEmpty();
        assertThat(dot(kai)).isEqualTo(1);

        // Shared again with Alex only: the old line is his again (it is about a thing he may see), and not Kai's.
        audience(
                nora,
                page,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(alexId));
        assertThat(lines(alex)).hasSize(1).first().asString().contains("House rules");
        assertThat(everyWay(kai)).allSatisfy(line -> assertThat(line).doesNotContain("House rules"));

        send(HttpMethod.DELETE, "/v1/things/" + list, alex, null, 204);
        assertThat(lines(kai)).isEmpty();
        assertThat(lines(nora)).isEmpty();
    }

    @Test
    void aBatchOfPhotosCountsForEachReaderOnlyThePhotosThatReaderMaySee() throws Exception {
        theLindsAndKai();
        List<String> shared = photos(alex, "circle", 3);
        List<String> more = photos(alex, "me", 2);
        // Two more, shared with Nora only.
        for (String photo : more) {
            audience(
                    alex,
                    photo,
                    "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(noraId));
        }

        assertThat(lines(nora)).hasSize(1).first().asString().startsWith("Alex added 5 photos");
        assertThat(lines(kai)).hasSize(1).first().asString().startsWith("Alex added 3 photos");
        assertThat(JsonPath.<String>read(activity(kai, "filter=photos"), "$.items[0].imageUrl"))
                .isNotNull();
        assertThat(lines(alex)).isEmpty();

        // Alex takes the three back: for Kai the line is gone, for Nora it counts the two that are left.
        for (String photo : shared) {
            audience(alex, photo, "{\"audience\":\"me\"}");
        }
        assertThat(everyWay(kai)).isEmpty();
        assertThat(dot(kai)).isZero();
        assertThat(lines(nora)).hasSize(1).first().asString().startsWith("Alex added 2 photos");
    }

    @Test
    void aChildNeverReadsMoneyInActivityAGuestOnlyWhatWasSharedByNameAndAGuestPassIsForTheAdults() throws Exception {
        theLinds();
        String teen = person("Tina");
        String teenId = join(nora, circle, teen);
        send(HttpMethod.PATCH, "/v1/members/" + teenId, nora, "{\"role\":\"teen\"}", 200);
        String guest = person("Gina");
        String guestId = join(nora, circle, guest);
        send(HttpMethod.PATCH, "/v1/members/" + guestId, nora, "{\"role\":\"guest\"}", 200);
        quiet();

        bill(nora, "Rent", 98000, TODAY, ",\"audience\":\"circle\"");
        String rules = page(nora, circle, "House rules", "circle");
        String pass = send(
                HttpMethod.POST,
                "/v1/circles/" + circle + "/guest-passes",
                nora,
                "{\"clientId\":\"%s\",\"guestName\":\"Ines\",\"endsAt\":\"%s\",\"thingIds\":[\"%s\"]}"
                        .formatted(id(), java.time.Instant.now().plusSeconds(3600), rules),
                201);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(
                        JsonPath.<String>read(pass, "$.url").replaceFirst("^https?://[^/]+", ""))
                .param("code", JsonPath.<String>read(pass, "$.code")));

        // Alex, an adult: the bill, the page, the pass, and the rent that is due today.
        assertThat(everyWay(alex)).anySatisfy(line -> assertThat(line).contains("Rent"));
        assertThat(lines(alex)).hasSize(3);
        // The teen: the page. Not the bill (Money is shut to her), not the pass, nothing due.
        assertThat(everyWay(teen))
                .isNotEmpty()
                .allSatisfy(line -> assertThat(line).contains("House rules"));
        assertThat(dot(teen)).isEqualTo(1);
        // The guest of the circle: nothing, until the page is shared with her by name.
        assertThat(everyWay(guest)).isEmpty();
        audience(
                nora,
                rules,
                "{\"audience\":\"circle\",\"people\":[{\"memberId\":\"%s\",\"access\":\"view\"}]}".formatted(guestId));
        assertThat(everyWay(guest))
                .isNotEmpty()
                .allSatisfy(line -> assertThat(line).contains("House rules"));
    }
}
