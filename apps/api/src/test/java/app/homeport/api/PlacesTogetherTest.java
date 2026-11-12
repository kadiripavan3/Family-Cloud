package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Where one place answers another: a goal in Plan that reads its number from a sheet in Money, a passport in
 * the Library that knows the trip it is linked to in Plan, the meal plan and the Saturday jar that ask the
 * calendar, and the list of your circles that says what you are owed in Money. Each place is asked through a
 * small interface, and answers only with what the person asking may see.
 */
class PlacesTogetherTest extends PlanTestBase {

    private static final String PASSPORT = """
            PASSPORT
            Surname: LIND
            Given names: MIA
            Date of expiry: 02 AUG 2027

            P<UTOLIND<<MIA<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
            L898902C36UTO1612044F2708023<<<<<<<<<<<<<<08
            """;

    // ---------- a goal that reads its number from a sheet ----------

    @Test
    void aGoalReadsItsNumberFromASheetForWhoeverMaySeeTheSheet() throws Exception {
        theLinds();
        // A savings sheet from the template: €500 saved of €8,000. In a family it starts as Nora's own.
        String sheet = send(
                HttpMethod.POST,
                "/v1/sheets",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"savings\",\"title\":\"Norway budget\",\"day\":\"%s\"}"
                        .formatted(id(), circle, TODAY),
                201);
        String sheetId = JsonPath.read(sheet, "$.id");
        // The app builds the goal's source from the sheet's own list of numbers.
        assertThat(JsonPath.<List<String>>read(fetch("/v1/sheets/" + sheetId + "/totals", nora), "$[*].name"))
                .containsExactly("Saved", "Goal", "To go", "Put in");
        send(HttpMethod.GET, "/v1/sheets/" + sheetId + "/totals", alex, null, 404);

        String goal = goal(
                nora,
                "Norway 2027",
                ",\"unit\":\"money\",\"target\":800000,\"current\":12300,\"audience\":\"circle\",\"source\":{\"kind\":\"sheet\",\"ref\":\"%s/Saved\",\"words\":\"the Norway sheet\"}"
                        .formatted(sheetId));

        // Nora sees the sheet: the goal shows the sheet's number, says where it reads it, and leads there.
        String hers = fetch("/v1/goals/" + goal + "?day=" + TODAY, nora);
        assertThat(JsonPath.<Integer>read(hers, "$.current")).isEqualTo(50_000);
        assertThat(JsonPath.<String>read(hers, "$.amountLine")).isEqualTo("€500 of €8,000");
        assertThat(JsonPath.<Boolean>read(hers, "$.source.live")).isTrue();
        assertThat(JsonPath.<String>read(hers, "$.source.line")).isEqualTo("Reads “Saved” in Norway budget");
        assertThat(JsonPath.<String>read(hers, "$.source.thingId")).isEqualTo(sheetId);
        String list = fetch("/v1/circles/" + circle + "/goals?day=" + TODAY, nora);
        assertThat(JsonPath.<String>read(list, "$[0].line")).startsWith("€500 of €8,000");
        assertThat(JsonPath.<String>read(list, "$[0].unit")).isEqualTo("money");
        assertThat(JsonPath.<String>read(fetch("/v1/things/" + goal, nora), "$.glance"))
                .endsWith("% · €500 of €8,000");

        // Change it there and the ring moves: another €250 goes into the sheet.
        String putIn = JsonPath.<List<String>>read(sheet, "$.tab.columns[?(@.name == 'Put in')].id")
                .get(0);
        send(
                HttpMethod.POST,
                "/v1/sheet-tabs/" + JsonPath.<String>read(sheet, "$.tab.id") + "/rows",
                nora,
                "{\"clientId\":\"%s\",\"cells\":{\"%s\":25000}}".formatted(id(), putIn),
                201);
        assertThat(JsonPath.<Integer>read(fetch("/v1/goals/" + goal + "?day=" + TODAY, nora), "$.current"))
                .isEqualTo(75_000);

        // Alex sees the goal but not the sheet: nothing of the sheet reaches him. He gets what was put in by hand.
        String his = fetch("/v1/goals/" + goal + "?day=" + TODAY, alex);
        assertThat(JsonPath.<Integer>read(his, "$.current")).isEqualTo(12_300);
        assertThat(JsonPath.<Boolean>read(his, "$.source.live")).isFalse();
        assertThat(JsonPath.<String>read(his, "$.source.line")).isEqualTo("Reads the Norway sheet");
        assertThat(JsonPath.<Object>read(his, "$.source.thingId")).isNull();
        assertThat(his).doesNotContain("Norway budget");

        // Shared with him, it is live for him too. A number the sheet doesn't have, or a sheet that is gone, isn't
        // read.
        share(nora, sheetId, "{\"audience\":\"circle\"}");
        assertThat(JsonPath.<Integer>read(fetch("/v1/goals/" + goal + "?day=" + TODAY, alex), "$.current"))
                .isEqualTo(75_000);
        send(
                HttpMethod.PATCH,
                "/v1/goals/" + goal,
                nora,
                "{\"source\":{\"kind\":\"sheet\",\"ref\":\"%s/Spent\"}}".formatted(sheetId),
                200);
        assertThat(JsonPath.<Boolean>read(fetch("/v1/goals/" + goal + "?day=" + TODAY, nora), "$.source.live"))
                .isFalse();
        send(
                HttpMethod.PATCH,
                "/v1/goals/" + goal,
                nora,
                "{\"source\":{\"kind\":\"sheet\",\"ref\":\"%s/Saved\"}}".formatted(sheetId),
                200);
        send(HttpMethod.DELETE, "/v1/things/" + sheetId, nora, null, 204);
        String after = fetch("/v1/goals/" + goal + "?day=" + TODAY, nora);
        assertThat(JsonPath.<Boolean>read(after, "$.source.live")).isFalse();
        assertThat(JsonPath.<Integer>read(after, "$.current")).isEqualTo(12_300);
    }

    @Test
    void aGoalNeverReadsASheetOfAnotherCircle() throws Exception {
        theLinds();
        String crew = circle(nora, "crew", "Lisbon crew");
        String theirs = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/sheets",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"savings\",\"title\":\"Crew kitty\",\"day\":\"%s\"}"
                                .formatted(id(), crew, TODAY),
                        201),
                "$.id");
        String goal = goal(
                nora,
                "Norway 2027",
                ",\"unit\":\"money\",\"target\":800000,\"audience\":\"circle\",\"source\":{\"kind\":\"sheet\",\"ref\":\"%s/Saved\"}"
                        .formatted(theirs));

        // Alex is not in the crew: the family's goal must not carry the crew's number to him.
        assertThat(JsonPath.<Boolean>read(fetch("/v1/goals/" + goal + "?day=" + TODAY, nora), "$.source.live"))
                .isFalse();
        assertThat(JsonPath.<Integer>read(fetch("/v1/goals/" + goal + "?day=" + TODAY, alex), "$.current"))
                .isZero();
    }

    // ---------- a document that runs out too soon after a trip ----------

    @Test
    void aPassportLinkedToATripInTheCalendarSaysItRunsOutTooSoonAfter() throws Exception {
        theLinds();
        String target = send(
                HttpMethod.POST,
                "/v1/media/uploads",
                nora,
                "{\"kind\":\"file\",\"contentType\":\"application/pdf\",\"fileName\":\"passport.pdf\"}",
                200);
        send(target, "application/pdf", "%PDF a scan".getBytes());
        String media = JsonPath.read(target, "$.mediaId");
        send(HttpMethod.POST, "/v1/media/uploads/" + media + "/complete", nora, null, 204);
        String passport = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/library",
                        nora,
                        "{\"circleId\":\"%s\",\"items\":[{\"clientId\":\"%s\",\"mediaId\":\"%s\",\"kind\":\"document\",\"title\":\"Mia's passport\",\"text\":%s}]}"
                                .formatted(
                                        circle,
                                        id(),
                                        media,
                                        new tools.jackson.databind.json.JsonMapper().writeValueAsString(PASSPORT)),
                        201),
                "$.items[0].item.id");
        // Two weeks in April, and a weekend long before the passport runs out.
        String norway = event(nora, "Norway 2027", "2027-04-03", null, ",\"endDay\":\"2027-04-17\"");
        String vienna = event(nora, "Weekend in Vienna", "2026-12-05", null, ",\"endDay\":\"2026-12-06\"");

        String alone = fetch("/v1/documents/" + passport + "?day=" + TODAY, nora);
        assertThat(JsonPath.<Object>read(alone, "$.clash")).isNull();
        // The words the phone read are handed back, so "change the words" starts with them.
        assertThat(JsonPath.<String>read(alone, "$.text")).isEqualTo(PASSPORT);

        send(HttpMethod.PUT, "/v1/things/" + passport + "/links/" + vienna, nora, null, 204);
        send(HttpMethod.PUT, "/v1/things/" + passport + "/links/" + norway, nora, null, 204);
        String linked = fetch("/v1/documents/" + passport + "?day=" + TODAY, nora);
        assertThat(JsonPath.<String>read(linked, "$.clash.trip.title")).isEqualTo("Norway 2027");
        assertThat(JsonPath.<String>read(linked, "$.clash.trip.kind")).isEqualTo("event");
        assertThat(JsonPath.<String>read(linked, "$.clash.tripEnds")).isEqualTo("2027-04-17");
        assertThat(JsonPath.<Integer>read(linked, "$.clash.monthsLeftAfter")).isEqualTo(4);
        // "Needed for Norway 2027 · 3 to 17 April": a trip says all its days.
        assertThat(JsonPath.<List<String>>read(linked, "$.linked[?(@.title == 'Norway 2027')].glance"))
                .containsExactly("3 to 17 April 2027");

        // The trip moves to the summer before: the passport is good for long enough again.
        send(
                HttpMethod.PATCH,
                "/v1/events/" + norway,
                nora,
                "{\"day\":\"2026-12-20\",\"endDay\":\"2027-01-03\",\"timeZone\":\"%s\"}".formatted(ZONE),
                200);
        assertThat(JsonPath.<Object>read(fetch("/v1/documents/" + passport + "?day=" + TODAY, nora), "$.clash"))
                .isNull();
    }

    // ---------- the meal plan and the Saturday jar ask the calendar ----------

    private String board(String token, String template) throws Exception {
        return JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/boards",
                        token,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"template\":\"%s\",\"audience\":\"circle\",\"settings\":{}}"
                                .formatted(id(), circle, template),
                        201),
                "$.id");
    }

    @Test
    void theMealPlanShowsTheDinnersOfTheCalendarOnTheirDayToWhoeverMaySeeThem() throws Exception {
        theLinds();
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        LocalDate monday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        String plan = board(nora, "meal_plan");
        send(
                HttpMethod.POST,
                "/v1/boards/" + plan + "/entries",
                nora,
                "{\"clientId\":\"%s\",\"kind\":\"meal\",\"fields\":{\"day\":\"%s\",\"name\":\"Tomato pasta\"}}"
                        .formatted(id(), monday),
                201);
        String dinner = event(
                nora, "Dinner at Grandma Astrid's", monday.plusDays(5).toString(), "18:30", ",\"audience\":\"circle\"");
        // Not dinners: a dentist, and "dinner" inside another word.
        event(nora, "Dentist · Mia", monday.plusDays(3).toString(), "15:30", ",\"audience\":\"circle\"");
        event(nora, "Dinnerware sale", monday.plusDays(3).toString(), "10:00", ",\"audience\":\"circle\"");
        // A dinner only Nora knows of, and one that comes round every Sunday.
        event(nora, "Surprise dinner for Alex", monday.plusDays(4).toString(), "19:00", ",\"audience\":\"me\"");
        event(
                nora,
                "Sunday supper",
                monday.minusDays(8).toString(),
                "18:00",
                ",\"audience\":\"circle\",\"repeat\":{\"unit\":\"week\"}");

        String hers = fetch("/v1/boards/" + plan + "?day=" + today, nora);
        assertThat(JsonPath.<List<String>>read(hers, "$.view.days[*].meals[*].name"))
                .containsExactly(
                        "Tomato pasta", "Surprise dinner for Alex", "Dinner at Grandma Astrid's", "Sunday supper");
        assertThat(JsonPath.<List<String>>read(hers, "$.view.days[5].meals[*].name"))
                .containsExactly("Dinner at Grandma Astrid's");
        assertThat(JsonPath.<List<Boolean>>read(hers, "$.view.days[*].meals[*].fromCalendar"))
                .containsExactly(false, true, true, true);
        assertThat(JsonPath.<List<Object>>read(hers, "$.view.days[5].meals[*].id"))
                .as("a dinner from the calendar is no meal of the plan: nothing to change here")
                .containsExactly((Object) null);
        // Alex isn't shown the surprise.
        assertThat(JsonPath.<List<String>>read(
                        fetch("/v1/boards/" + plan + "?day=" + today, alex), "$.view.days[*].meals[*].name"))
                .containsExactly("Tomato pasta", "Dinner at Grandma Astrid's", "Sunday supper");
        // The event is gone from the calendar: so is the dinner.
        send(HttpMethod.DELETE, "/v1/things/" + dinner, nora, null, 204);
        assertThat(fetch("/v1/boards/" + plan + "?day=" + today, nora)).doesNotContain("Grandma Astrid");
    }

    @Test
    void theSaturdayJarSaysEveryoneIsFreeWhenNobodyHasAnythingInTheCalendarThatDay() throws Exception {
        theLinds();
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        String jar = board(nora, "saturday_jar");
        // Yesterday's and tomorrow's events, a job and a bill keep nobody from an afternoon out.
        event(nora, "Yesterday's thing", today.minusDays(1).toString(), "10:00", ",\"audience\":\"circle\"");
        event(nora, "Tomorrow's thing", today.plusDays(1).toString(), "10:00", ",\"audience\":\"circle\"");
        reminder(nora, "Take the bins out", ",\"dueOn\":\"%s\",\"audience\":\"circle\"".formatted(today));
        send(
                HttpMethod.POST,
                "/v1/bills",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Rent\",\"amountCents\":98000,\"dueOn\":\"%s\",\"audience\":\"circle\"}"
                        .formatted(id(), circle, today),
                201);
        assertThat(JsonPath.<Boolean>read(fetch("/v1/boards/" + jar + "?day=" + today, nora), "$.view.everyoneFree"))
                .isTrue();
        assertThat(JsonPath.<Integer>read(fetch("/v1/boards/" + jar + "?day=" + today, nora), "$.view.people"))
                .isEqualTo(4);

        // Something only Nora knows of today: she isn't free, and Alex is told nothing by the jar.
        String hers = event(nora, "A secret errand", today.toString(), "11:00", ",\"audience\":\"me\"");
        assertThat(JsonPath.<Boolean>read(fetch("/v1/boards/" + jar + "?day=" + today, nora), "$.view.everyoneFree"))
                .isFalse();
        assertThat(JsonPath.<Boolean>read(fetch("/v1/boards/" + jar + "?day=" + today, alex), "$.view.everyoneFree"))
                .isTrue();
        send(HttpMethod.DELETE, "/v1/things/" + hers, nora, null, 204);

        // Leo's haircut, which comes round every week on this day of the week: not everyone is free, for both.
        event(
                nora,
                "Haircut · Leo",
                today.minusWeeks(3).toString(),
                "10:00",
                ",\"audience\":\"circle\",\"repeat\":{\"unit\":\"week\"},\"guests\":[{\"memberId\":\"%s\"}]"
                        .formatted(leoId));
        assertThat(JsonPath.<Boolean>read(fetch("/v1/boards/" + jar + "?day=" + today, alex), "$.view.everyoneFree"))
                .isFalse();
    }

    // ---------- "you're owed €64" in the circle switcher ----------

    @Test
    void theListOfYourCirclesSaysWhatYouAreOwedAmongFriends() throws Exception {
        theLinds();
        String lea = person("Lea");
        String kai = person("Kai");
        String crew = circle(nora, "crew", "Lisbon crew");
        String noraThere = JsonPath.read(fetch("/v1/circles/" + crew, nora), "$.myMemberId");
        String leaThere = join(nora, crew, lea);
        join(nora, crew, kai);
        String split = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/splits",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Lisbon weekend\"}".formatted(id(), crew),
                        201),
                "$.id");
        // Nora paid €128 for herself and Lea: Lea owes her €64.
        send(
                HttpMethod.POST,
                "/v1/splits/" + split + "/expenses",
                nora,
                "{\"clientId\":\"%s\",\"title\":\"Dinner\",\"amountCents\":12800,\"paidBy\":\"%s\",\"spentOn\":\"2026-11-01\",\"shares\":[{\"memberId\":\"%s\"},{\"memberId\":\"%s\"}]}"
                        .formatted(id(), noraThere, noraThere, leaThere),
                201);
        // In the family, Nora paid for a shop she shares with Alex. A family keeps that in Money, not under its name.
        String between = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/splits",
                        nora,
                        "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"Between us\",\"audience\":\"circle\"}"
                                .formatted(id(), circle),
                        201),
                "$.id");
        send(
                HttpMethod.POST,
                "/v1/splits/" + between + "/expenses",
                nora,
                "{\"clientId\":\"%s\",\"title\":\"Big shop\",\"amountCents\":8400,\"paidBy\":\"%s\",\"spentOn\":\"2026-11-01\",\"shares\":[{\"memberId\":\"%s\"},{\"memberId\":\"%s\"}]}"
                        .formatted(id(), noraId, noraId, alexId),
                201);

        String hers = fetch("/v1/circles", nora);
        assertThat(JsonPath.<List<String>>read(hers, "$[?(@.name == 'Lisbon crew')].line"))
                .containsExactly("you're owed €64");
        assertThat(JsonPath.<List<Object>>read(hers, "$[?(@.name == 'The Linds')].line"))
                .containsExactly((Object) null);
        assertThat(JsonPath.<String>read(fetch("/v1/circles/" + crew, nora), "$.line"))
                .isEqualTo("you're owed €64");
        // From the other side, and for someone who is even.
        assertThat(JsonPath.<List<String>>read(fetch("/v1/circles", lea), "$[*].line"))
                .containsExactly("you owe €64");
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/circles", kai), "$[*].line"))
                .containsExactly((Object) null);

        // Lea pays: nothing is left to say.
        send(
                HttpMethod.POST,
                "/v1/splits/" + split + "/payments",
                lea,
                "{\"clientId\":\"%s\",\"from\":\"%s\",\"to\":\"%s\",\"amountCents\":6400,\"paidOn\":\"2026-11-02\"}"
                        .formatted(id(), leaThere, noraThere),
                201);
        assertThat(JsonPath.<List<Object>>read(fetch("/v1/circles", nora), "$[?(@.name == 'Lisbon crew')].line"))
                .containsExactly((Object) null);
    }
}
