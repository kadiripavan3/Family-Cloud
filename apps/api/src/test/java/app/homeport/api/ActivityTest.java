package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import app.homeport.api.activity.ActivityStore;
import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

/**
 * Activity: what gets a line, how lines fold, what is due, and what is new. Who may read a line is
 * {@link ActivitySharingTest}'s.
 */
class ActivityTest extends TiesTestBase {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of(ZONE));

    @Autowired
    ActivityStore store;

    @Test
    void whatIsMadeWhereOthersSeeItIsNewsForThemAndNobodySeesTheirOwnChangesAsNews() throws Exception {
        theLinds();
        page(nora, circle, "Packing for Norway", "circle");
        page(nora, circle, "Diary", "me");
        String list = checklist(nora, "Groceries", "circle");

        // Alex hears of the two things he can see, newest first. Nora hears nothing: they are her own.
        assertThat(sentences(alex)).containsExactly("Nora added Groceries", "Nora added Packing for Norway");
        assertThat(lines(alex).get(0)).startsWith("Nora added Groceries | List");
        assertThat(lines(nora)).isEmpty();
        String first = activity(alex, "");
        assertThat(JsonPath.<String>read(first, "$.items[0].kind")).isEqualTo("added");
        assertThat(JsonPath.<String>read(first, "$.items[0].thingId")).isEqualTo(list);
        assertThat(JsonPath.<String>read(first, "$.items[0].thingKind")).isEqualTo("checklist");
        assertThat(JsonPath.<List<String>>read(first, "$.items[0].people[*].name"))
                .containsExactly("Nora");
        assertThat(JsonPath.<List<Boolean>>read(first, "$.items[0].sentence[*].bold"))
                .containsExactly(true, false, true);

        // Sending the same create again makes no second line, and sharing the diary is news once.
        String body =
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Recipes\",\"body\":\"\",\"audience\":\"circle\"}"
                        .formatted(id(), circle);
        String recipes = JsonPath.read(send(HttpMethod.POST, "/v1/pages", nora, body, 201), "$.id");
        send(HttpMethod.POST, "/v1/pages", nora, body, 201);
        assertThat(sentences(alex)).hasSize(3).startsWith("Nora added Recipes");
        assertThat(recipes).isNotNull();
    }

    @Test
    void linesOnAListFoldIntoOneWithCountsAndTwoPeoplesLinesAboutOneThingAreReadAsOne() throws Exception {
        theLinds();
        String kai = person("Kai");
        join(nora, circle, kai);
        quiet();
        String list = checklist(nora, "Groceries", "circle");
        String milk = addLine(alex, list, "Milk");
        addLine(alex, list, "Eggs");
        addLine(alex, list, "Bread");
        tick(alex, milk);
        String oats = addLine(kai, list, "Oats");
        tick(kai, oats);
        tick(kai, addLine(nora, list, "Jam"));

        // Nora reads Alex's and Kai's changes as one line; her own line added nothing to it.
        assertThat(lines(nora)).contains("Kai and Alex changed Groceries | 4 things added, 3 ticked");
        assertThat(JsonPath.<List<String>>read(activity(nora, ""), "$.items[0].people[*].name"))
                .containsExactly("Kai", "Alex");
        // Alex reads Kai's and Nora's; Kai reads Alex's and Nora's. Each without their own.
        assertThat(lines(alex)).contains("Kai and Nora changed Groceries | 2 things added, 2 ticked");
        assertThat(lines(kai)).contains("Nora and Alex changed Groceries | 4 things added, 1 ticked");
        // In the table it is one row per person, however often they ticked.
        assertThat(jdbc.sql("select count(*) from activity where kind = 'list'")
                        .query(Integer.class)
                        .single())
                .isEqualTo(3);
        // Yesterday's changes are a line of their own.
        jdbc.sql(
                        "update activity set day = day - 1, at = at - interval '1 day', fold_key = fold_key || ':old' where kind = 'list'")
                .update();
        tick(alex, addLine(alex, list, "Tea"));
        assertThat(lines(nora))
                .contains(
                        "Alex changed Groceries | 1 thing added, 1 ticked",
                        "Kai and Alex changed Groceries | 4 things added, 3 ticked");
    }

    @Test
    void aBillPaidATemplateInItsOwnWordsAGuestPassAndComingAndGoingEachSayWhatHappened() throws Exception {
        theLinds();
        String electricity = bill(nora, "Electricity", 8420, TODAY.plusDays(9).toString(), ",\"audience\":\"circle\"");
        send(
                HttpMethod.PUT,
                "/v1/bills/" + electricity + "/paid",
                alex,
                "{\"dueOn\":\"%s\"}".formatted(TODAY.plusDays(9)),
                200);
        // The chore wheel says in its own words what Leo did, though the tick came from Nora's phone.
        String wheel = make(
                nora,
                "/v1/boards",
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"chore_wheel\",\"audience\":\"circle\",\"settings\":{\"people\":[\"%s\"]}}"
                        .formatted(id(), circle, leoId));
        String job = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/boards/" + wheel + "/entries",
                        nora,
                        "{\"clientId\":\"%s\",\"kind\":\"job\",\"fields\":{\"name\":\"Feed Biscuit\",\"timesAWeek\":7}}"
                                .formatted(id()),
                        201),
                "$.entryId");
        send(
                HttpMethod.POST,
                "/v1/boards/" + wheel + "/act",
                nora,
                "{\"verb\":\"tick\",\"body\":{\"jobId\":\"%s\"}}".formatted(job),
                200);
        // A guest opens her pass.
        String pass = send(
                HttpMethod.POST,
                "/v1/circles/" + circle + "/guest-passes",
                nora,
                "{\"clientId\":\"%s\",\"guestName\":\"Ines\",\"endsAt\":\"%s\",\"thingIds\":[\"%s\"]}"
                        .formatted(id(), Instant.now().plusSeconds(3600), page(nora, circle, "For the sitter", "me")),
                201);
        mvc.perform(post(JsonPath.<String>read(pass, "$.url").replaceFirst("^https?://[^/]+", ""))
                .param("code", JsonPath.<String>read(pass, "$.code")));
        // Someone joins, and leaves again.
        String kai = person("Kai");
        String kaiId = join(nora, circle, kai);
        send(HttpMethod.DELETE, "/v1/members/" + kaiId, kai, null, 204);

        List<String> forAlex = lines(alex);
        assertThat(forAlex)
                .startsWith("Kai left the circle", "Kai joined the circle")
                .contains("Leo fed Biscuit and earned a star | Chore wheel", "Nora added to Chore wheel")
                .anySatisfy(line -> assertThat(line).startsWith("Nora added Electricity | Bill"))
                .anySatisfy(line -> assertThat(line).startsWith("Ines opened their guest pass | it ends at "));
        // Nora made the wheel and ticked for Leo: that Leo fed Biscuit is still his line, and news to her too.
        assertThat(lines(nora))
                .contains("Leo fed Biscuit and earned a star | Chore wheel", "Alex paid Electricity | €84.20")
                .noneMatch(line -> line.startsWith("Nora added"));
    }

    @Test
    void whatIsDueTodayAndTomorrowIsLaidInFromThePlacesAndNeverKept() throws Exception {
        theLinds();
        String electricity = bill(
                nora,
                "Electricity",
                8420,
                TODAY.plusDays(1).toString(),
                ",\"audience\":\"circle\",\"emoji\":\"⚡\",\"shares\":[{\"memberId\":\"%s\",\"parts\":1},{\"memberId\":\"%s\",\"parts\":1}]"
                        .formatted(noraId, alexId));
        bill(nora, "Rent", 98000, TODAY.plusDays(5).toString(), ",\"audience\":\"circle\"");
        reminder(nora, "Take the bins out", ",\"dueOn\":\"%s\",\"dueTime\":\"19:00\"".formatted(TODAY));
        reminder(nora, "Call the plumber", ",\"dueOn\":\"%s\"".formatted(TODAY.plusDays(1)));
        event(nora, "Dentist", TODAY.toString(), "15:30", "");

        String hers = activity(nora, "day=" + TODAY);

        // Today's reminder and tomorrow's bill. Not the rent (next week), not the event (it is on, not due),
        // not tomorrow's reminder (tomorrow's news).
        assertThat(said(hers, "due"))
                .containsExactly(
                        "Take the bins out is due today | Tonight",
                        "Electricity is due tomorrow, €84.20 | Your half is €42.10");
        assertThat(JsonPath.<String>read(hers, "$.due[1].emoji")).isEqualTo("⚡");
        assertThat(JsonPath.<String>read(hers, "$.due[1].buttons[0].label")).isEqualTo("Pay");
        assertThat(JsonPath.<String>read(hers, "$.due[1].buttons[0].act")).isEqualTo("pay");
        assertThat(JsonPath.<String>read(hers, "$.due[1].buttons[0].thingId")).isEqualTo(electricity);
        assertThat(JsonPath.<String>read(hers, "$.due[1].buttons[0].dueOn"))
                .isEqualTo(TODAY.plusDays(1).toString());
        assertThat(JsonPath.<String>read(hers, "$.due[1].kind")).isEqualTo("due");
        // The chips: Money has the bill, Plan the reminder, Photos and Asks nothing that is due.
        assertThat(said(activity(nora, "filter=money&day=" + TODAY), "due")).hasSize(1);
        assertThat(said(activity(nora, "filter=plan&day=" + TODAY), "due"))
                .containsExactly("Take the bins out is due today | Tonight");
        assertThat(said(activity(nora, "filter=photos&day=" + TODAY), "due")).isEmpty();
        assertThat(said(activity(nora, "filter=asks&day=" + TODAY), "due")).isEmpty();
        // Once her half is paid it is no longer due for her. For Alex it still is.
        send(
                HttpMethod.PUT,
                "/v1/bills/" + electricity + "/paid",
                nora,
                "{\"dueOn\":\"%s\"}".formatted(TODAY.plusDays(1)),
                200);
        assertThat(said(activity(nora, "day=" + TODAY), "due"))
                .containsExactly("Take the bins out is due today | Tonight");
        assertThat(said(activity(alex, "day=" + TODAY), "due"))
                .containsExactly("Electricity is due tomorrow, €84.20 | Your half is €42.10");
        // Yesterday it would have been two days away, and the day after it is late.
        assertThat(said(activity(alex, "day=" + TODAY.minusDays(1)), "due")).isEmpty();
        assertThat(said(activity(alex, "day=" + TODAY.plusDays(2)), "due"))
                .containsExactly("Electricity was due yesterday, €84.20 | Your half is €42.10");
        assertThat(jdbc.sql("select count(*) from activity where kind = 'due'")
                        .query(Integer.class)
                        .single())
                .isZero();
    }

    @Test
    void theChipsFilterThePagesFollowOneAnotherAndTheDotCountsWhatIsNew() throws Exception {
        theLinds();
        for (int n = 1; n <= 7; n++) {
            page(nora, circle, "Page " + n, "circle");
        }
        bill(nora, "Rent", 98000, TODAY.plusDays(20).toString(), ",\"audience\":\"circle\"");
        event(nora, "Dentist", TODAY.plusDays(3).toString(), "15:30", ",\"audience\":\"circle\"");
        photos(nora, "circle", 3);

        assertThat(said(activity(alex, "filter=money"), "items"))
                .containsExactly("Nora added Rent | Bill · €980 · due " + shortDay(TODAY.plusDays(20)));
        assertThat(said(activity(alex, "filter=plan"), "items"))
                .hasSize(1)
                .first()
                .asString()
                .startsWith("Nora added Dentist | Event");
        assertThat(said(activity(alex, "filter=photos"), "items"))
                .hasSize(1)
                .first()
                .asString()
                .startsWith("Nora added 3 photos");
        assertThat(said(activity(alex, "filter=asks"), "items")).isEmpty();
        send(HttpMethod.GET, "/v1/circles/" + circle + "/activity?filter=everything", alex, null, 400);

        // Ten lines, four to a page: every line once, in order, and a cursor nobody handed out is refused.
        String first = activity(alex, "limit=4");
        String second = activity(alex, "limit=4&cursor=" + JsonPath.<String>read(first, "$.nextCursor"));
        String third = activity(alex, "limit=4&cursor=" + JsonPath.<String>read(second, "$.nextCursor"));
        List<String> all = new java.util.ArrayList<>(JsonPath.<List<String>>read(first, "$.items[*].id"));
        all.addAll(JsonPath.<List<String>>read(second, "$.items[*].id"));
        all.addAll(JsonPath.<List<String>>read(third, "$.items[*].id"));
        assertThat(all).hasSize(10).doesNotHaveDuplicates();
        assertThat(JsonPath.<String>read(third, "$.nextCursor")).isNull();
        send(HttpMethod.GET, "/v1/circles/" + circle + "/activity?cursor=nonsense", alex, null, 400);

        // All ten are new to Alex until he has looked; then nothing is, until something else happens.
        String unread = "/v1/circles/" + circle + "/activity/unread";
        assertThat(JsonPath.<Integer>read(fetch(unread, alex), "$.fresh")).isEqualTo(10);
        assertThat(JsonPath.<Integer>read(fetch(unread, nora), "$.fresh")).isZero();
        assertThat(JsonPath.<List<Boolean>>read(first, "$.items[*].fresh")).containsOnly(true);
        send(HttpMethod.PUT, "/v1/circles/" + circle + "/activity/seen", alex, null, 204);
        assertThat(JsonPath.<Integer>read(fetch(unread, alex), "$.fresh")).isZero();
        assertThat(JsonPath.<List<Boolean>>read(activity(alex, ""), "$.items[*].fresh"))
                .containsOnly(false);
        page(nora, circle, "One more", "circle");
        assertThat(JsonPath.<Integer>read(fetch(unread, alex), "$.fresh")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(activity(alex, ""), "$.fresh")).isEqualTo(1);
        assertThat(JsonPath.<Boolean>read(activity(alex, ""), "$.items[0].fresh"))
                .isTrue();
    }

    @Test
    void linesGoWithTheThingTheyAreAboutAndOldOnesAreForgotten() throws Exception {
        theLinds();
        String page = page(nora, circle, "Packing", "circle");
        String list = checklist(nora, "Groceries", "circle", "Milk");
        assertThat(lines(alex)).hasSize(2);

        send(HttpMethod.DELETE, "/v1/things/" + page, nora, null, 204);

        assertThat(lines(alex)).containsExactly("Nora added Groceries | List · 0 of 1 done");
        assertThat(jdbc.sql("select count(*) from activity")
                        .query(Integer.class)
                        .single())
                .isEqualTo(1);
        // Activity is news, not a record: after three months a line is forgotten.
        jdbc.sql("update activity set at = now() - interval '91 days'").update();
        assertThat(store.forgetOlderThan(90)).isEqualTo(1);
        assertThat(lines(alex)).isEmpty();
        assertThat(list).isNotNull();
    }

    private static String shortDay(LocalDate day) {
        return java.time.format.DateTimeFormatter.ofPattern("EEE d MMM", java.util.Locale.ENGLISH)
                .format(day);
    }
}
