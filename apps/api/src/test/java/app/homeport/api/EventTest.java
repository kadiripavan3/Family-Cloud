package app.homeport.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** Events: when, where, who is coming, and coming round again. */
class EventTest extends PlanTestBase {

    @Test
    void anEventSentTwiceIsMadeOnceAndShowsOnItsDayWithItsTimes() throws Exception {
        theLinds();
        String body =
                ("{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\" Dentist · Mia \",\"day\":\"2026-11-11\",\"time\":\"15:30\","
                                + "\"endTime\":\"16:15\",\"timeZone\":\"%s\",\"place\":\"Trubarjeva 12\",\"audience\":\"circle\"}")
                        .formatted(id(), circle, ZONE);

        String first = send(HttpMethod.POST, "/v1/events", nora, body, 201);
        String second = send(HttpMethod.POST, "/v1/events", nora, body, 201);

        String id = JsonPath.read(first, "$.id");
        assertThat(JsonPath.<String>read(second, "$.id")).isEqualTo(id);
        String event = fetch("/v1/events/" + id, nora);
        assertThat(JsonPath.<String>read(event, "$.title")).isEqualTo("Dentist · Mia");
        assertThat(JsonPath.<String>read(event, "$.time"))
                .as("a time on the clock, hours and minutes")
                .isEqualTo("15:30");
        assertThat(JsonPath.<String>read(event, "$.endTime")).isEqualTo("16:15");
        assertThat(JsonPath.<String>read(event, "$.startsAt"))
                .as("the moment, for a phone somewhere else: Ljubljana is an hour ahead in November")
                .isEqualTo("2026-11-11T14:30:00Z");
        assertThat(JsonPath.<Boolean>read(event, "$.allDay")).isFalse();
        assertThat(JsonPath.<Boolean>read(event, "$.mine")).isTrue();
        assertThat(JsonPath.<String>read(event, "$.chip.audience")).isEqualTo("circle");

        String plan = fetch("/v1/circles/" + circle + "/plan?day=2026-11-11&days=1", alex);
        assertThat(JsonPath.<List<String>>read(plan, "$.days[0].entries[*].title"))
                .containsExactly("Dentist · Mia");
        assertThat(JsonPath.<String>read(plan, "$.days[0].entries[0].lead")).isEqualTo("15:30");
        assertThat(JsonPath.<String>read(plan, "$.days[0].entries[0].leadEnd")).isEqualTo("16:15");
        assertThat(JsonPath.<String>read(plan, "$.days[0].entries[0].note")).isEqualTo("Trubarjeva 12");
        assertThat(JsonPath.<String>read(plan, "$.days[0].entries[0].noteIcon")).isEqualTo("pin");
        assertThat(day(nora, "2026-11-12")).isEmpty();
    }

    @Test
    void anEventIsChangedPieceByPieceAndWhenItIsChangesTogether() throws Exception {
        theLinds();
        String id = event(nora, "School fair", "2026-11-14", "10:00", ",\"endTime\":\"12:00\",\"remindMinutes\":60");

        // Only the title: everything else stays.
        String renamed = send(HttpMethod.PATCH, "/v1/events/" + id, nora, "{\"title\":\"Autumn fair\"}", 200);
        assertThat(JsonPath.<String>read(renamed, "$.time")).isEqualTo("10:00");
        assertThat(JsonPath.<Integer>read(renamed, "$.remindMinutes")).isEqualTo(60);
        assertThat(JsonPath.<String>read(renamed, "$.remindLabel")).isEqualTo("1 hour before");

        // A day with no time makes it all day, over two days.
        String allDay = send(
                HttpMethod.PATCH,
                "/v1/events/" + id,
                nora,
                "{\"day\":\"2026-11-21\",\"endDay\":\"2026-11-22\",\"stopReminding\":true,\"notes\":\"Bring cake\"}",
                200);
        assertThat(JsonPath.<Boolean>read(allDay, "$.allDay")).isTrue();
        assertThat(JsonPath.<Object>read(allDay, "$.time")).isNull();
        assertThat(JsonPath.<Object>read(allDay, "$.startsAt")).isNull();
        assertThat(JsonPath.<Object>read(allDay, "$.remindMinutes")).isNull();
        assertThat(day(nora, "2026-11-14")).isEmpty();
        assertThat(day(nora, "2026-11-21")).containsExactly("All day|Autumn fair|Bring cake");
        assertThat(day(nora, "2026-11-22")).containsExactly("All day|Autumn fair|Bring cake");

        // What can't be: an end before the start, a time zone nobody knows, no name.
        send(HttpMethod.PATCH, "/v1/events/" + id, nora, "{\"day\":\"2026-11-21\",\"endDay\":\"2026-11-20\"}", 400);
        send(
                HttpMethod.PATCH,
                "/v1/events/" + id,
                nora,
                "{\"day\":\"2026-11-21\",\"time\":\"10:00\",\"endTime\":\"09:00\"}",
                400);
        send(HttpMethod.PATCH, "/v1/events/" + id, nora, "{\"day\":\"2026-11-21\",\"timeZone\":\"Mars/Olympus\"}", 400);
        send(HttpMethod.PATCH, "/v1/events/" + id, nora, "{\"title\":\"\"}", 400);
        send(
                HttpMethod.POST,
                "/v1/events",
                nora,
                "{\"clientId\":\"%s\",\"circleId\":\"%s\",\"title\":\"No day\",\"timeZone\":\"%s\"}"
                        .formatted(id(), circle, ZONE),
                400);
    }

    @Test
    void whoIsComingIsChangedOnePersonAtATimeAndEveryoneAnswersForThemselves() throws Exception {
        theLinds();
        String id = event(
                nora,
                "Mia's party",
                "2026-12-05",
                "14:00",
                ",\"audience\":\"circle\",\"guests\":[{\"memberId\":\"%s\",\"answer\":\"going\"},{\"name\":\"Lea\"}]"
                        .formatted(noraId));
        share(nora, id, "{\"audience\":\"circle\",\"everyoneEdits\":false}");

        // Someone of the circle is on an event once; someone from outside is a name.
        String leo = JsonPath.read(
                send(
                        HttpMethod.POST,
                        "/v1/events/" + id + "/guests",
                        nora,
                        "{\"clientId\":\"%s\",\"memberId\":\"%s\"}".formatted(id(), leoId),
                        201),
                "$.id");
        String again = send(
                HttpMethod.POST,
                "/v1/events/" + id + "/guests",
                nora,
                "{\"clientId\":\"%s\",\"memberId\":\"%s\"}".formatted(id(), leoId),
                201);
        assertThat(JsonPath.<String>read(again, "$.id")).isEqualTo(leo);
        String tina = "{\"clientId\":\"%s\",\"name\":\"Tina\"}".formatted(id());
        send(HttpMethod.POST, "/v1/events/" + id + "/guests", nora, tina, 201);
        send(HttpMethod.POST, "/v1/events/" + id + "/guests", nora, tina, 201);
        send(HttpMethod.POST, "/v1/events/" + id + "/guests", nora, "{\"clientId\":\"%s\"}".formatted(id()), 400);

        // Alex may only look at it. He can still say he is going, and nothing else.
        send(
                HttpMethod.POST,
                "/v1/events/" + id + "/guests",
                alex,
                "{\"clientId\":\"%s\",\"name\":\"Jan\"}".formatted(id()),
                403);
        String answered = send(HttpMethod.PUT, "/v1/events/" + id + "/answer", alex, "{\"answer\":\"maybe\"}", 200);
        assertThat(JsonPath.<String>read(answered, "$.myAnswer")).isEqualTo("maybe");
        send(HttpMethod.PUT, "/v1/events/" + id + "/answer", alex, "{\"answer\":\"going\"}", 200);
        send(HttpMethod.PATCH, "/v1/event-guests/" + leo, alex, "{\"answer\":\"cant\"}", 403);
        send(HttpMethod.DELETE, "/v1/event-guests/" + leo, alex, null, 403);

        // Nora answers for Leo, who has no phone, and says what he does there.
        send(
                HttpMethod.PATCH,
                "/v1/event-guests/" + leo,
                nora,
                "{\"answer\":\"going\",\"part\":\"brings the music\"}",
                200);

        String event = fetch("/v1/events/" + id, nora);
        assertThat(JsonPath.<List<String>>read(event, "$.guests[*].name"))
                .containsExactly("Nora", "Lea", "Leo", "Tina", "Alex");
        assertThat(JsonPath.<Integer>read(event, "$.going")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(event, "$.unanswered")).isEqualTo(2);
        assertThat(JsonPath.<Boolean>read(event, "$.guests[0].you")).isTrue();
        assertThat(JsonPath.<String>read(event, "$.guests[2].part")).isEqualTo("brings the music");
        assertThat(JsonPath.<Object>read(event, "$.guests[1].memberId")).isNull();

        // Taking someone off, twice, is fine. Someone from another circle can't be put on.
        send(HttpMethod.DELETE, "/v1/event-guests/" + leo, nora, null, 204);
        send(HttpMethod.DELETE, "/v1/event-guests/" + leo, nora, null, 204);
        String kai = person("Kai");
        String elsewhere = JsonPath.read(fetch("/v1/circles/" + circle(kai, "solo", "Kai"), kai), "$.myMemberId");
        send(
                HttpMethod.POST,
                "/v1/events/" + id + "/guests",
                nora,
                "{\"clientId\":\"%s\",\"memberId\":\"%s\"}".formatted(id(), elsewhere),
                400);
    }

    @Test
    void puttingSomeoneOnAnEventShowsItToThemButNeverToSomeoneItIsHiddenFrom() throws Exception {
        theLinds();
        String mia = person("Mia");
        String miaWithPhone = join(nora, circle, mia);

        // Only Nora's, with Alex on it: now it is shared with Alex, to look at.
        String id = event(
                nora,
                "Dentist",
                "2026-11-11",
                "15:30",
                ",\"guests\":[{\"memberId\":\"%s\",\"part\":\"is taking her\"}]".formatted(alexId));
        String asAlex = fetch("/v1/events/" + id, alex);
        assertThat(JsonPath.<String>read(asAlex, "$.chip.audience")).isEqualTo("some");
        assertThat(JsonPath.<List<String>>read(asAlex, "$.chip.people[*].name")).containsExactly("Alex");
        assertThat(JsonPath.<Boolean>read(asAlex, "$.canEdit")).isFalse();
        send(HttpMethod.GET, "/v1/events/" + id, mia, null, 404);

        // A surprise: hidden from Mia. She can't be put on it until that changes.
        String party = event(nora, "Surprise party", "2026-12-05", "14:00", ",\"audience\":\"circle\"");
        share(nora, party, "{\"audience\":\"circle\",\"hiddenFrom\":[{\"memberId\":\"%s\"}]}".formatted(miaWithPhone));
        String problem = send(
                HttpMethod.POST,
                "/v1/events/" + party + "/guests",
                nora,
                "{\"clientId\":\"%s\",\"memberId\":\"%s\"}".formatted(id(), miaWithPhone),
                409);
        assertThat(JsonPath.<String>read(problem, "$.detail")).contains("hidden from Mia");
        send(HttpMethod.GET, "/v1/events/" + party, mia, null, 404);

        // Alex may change Nora's event (it is everyone's to edit), but only Nora can show it to someone new.
        String private2 = event(nora, "Parents' evening", "2026-11-19", "18:00", "");
        share(
                nora,
                private2,
                "{\"audience\":\"some\",\"people\":[{\"memberId\":\"%s\",\"access\":\"edit\"}]}".formatted(alexId));
        send(
                HttpMethod.POST,
                "/v1/events/" + private2 + "/guests",
                alex,
                "{\"clientId\":\"%s\",\"memberId\":\"%s\"}".formatted(id(), miaWithPhone),
                403);
        send(HttpMethod.GET, "/v1/events/" + private2, mia, null, 404);
    }

    @Test
    void aGuestWithAPassReadsAnEventAndAReminderButAGoalCantGoOnAPass() throws Exception {
        theLinds();
        String day = java.time.LocalDate.now().plusDays(2).toString();
        String event = event(
                nora,
                "Bedtime story",
                day,
                "19:30",
                ",\"endTime\":\"20:00\",\"place\":\"Leo's room\",\"notes\":\"One story each\"");
        String reminder = reminder(
                nora,
                "Feed Biscuit",
                ",\"dueOn\":\"%s\",\"dueTime\":\"18:00\",\"notes\":\"Half a cup\"".formatted(day));
        String goal = goal(nora, "Norway", ",\"target\":8000");
        String things = "\"%s\",\"%s\"".formatted(event, reminder);
        String passBody = "{\"clientId\":\"%s\",\"guestName\":\"Ines\",\"endsAt\":\"%s\",\"thingIds\":[%s]}";

        String pass = send(
                HttpMethod.POST,
                "/v1/circles/" + circle + "/guest-passes",
                nora,
                passBody.formatted(id(), java.time.Instant.now().plusSeconds(3600), things),
                201);
        send(
                HttpMethod.POST,
                "/v1/circles/" + circle + "/guest-passes",
                nora,
                passBody.formatted(id(), java.time.Instant.now().plusSeconds(3600), "\"" + goal + "\""),
                400);

        String path = JsonPath.<String>read(pass, "$.url").replaceFirst("^https?://[^/]+", "");
        String opened = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path)
                        .param("code", JsonPath.<String>read(pass, "$.code")))
                .andReturn()
                .getResponse()
                .getContentAsString();
        assertThat(opened)
                .contains("Bedtime story")
                .contains("19:30 to 20:00")
                .contains("Leo&#39;s room")
                .contains("One story each")
                .contains("Feed Biscuit")
                .contains("18:00")
                .contains("Half a cup");
    }

    @Test
    void anEventThatRepeatsFallsOnEveryDayItComesRound() throws Exception {
        theLinds();
        String swimming = event(
                nora,
                "Swimming · Mia",
                "2026-11-05",
                "17:00",
                ",\"endTime\":\"17:45\",\"repeat\":{\"unit\":\"week\"},\"guests\":[{\"memberId\":\"%s\"}]"
                        .formatted(miaId));

        String event = fetch("/v1/events/" + swimming + "?day=2026-11-11", nora);
        assertThat(JsonPath.<String>read(event, "$.repeat.label")).isEqualTo("Thursdays");
        assertThat(JsonPath.<List<String>>read(event, "$.repeat.days")).containsExactly("thu");
        assertThat(JsonPath.<String>read(event, "$.nextDay")).isEqualTo("2026-11-12");

        assertThat(day(nora, "2026-11-11")).isEmpty();
        assertThat(day(nora, "2026-11-12")).containsExactly("17:00|Swimming · Mia|Thursdays");
        assertThat(day(nora, "2026-11-19")).containsExactly("17:00|Swimming · Mia|Thursdays");
        assertThat(day(nora, "2026-10-29")).as("not before it starts").isEmpty();

        // The month has Mia's dot on every Thursday from the 5th, and on no other day.
        String month = fetch("/v1/circles/" + circle + "/month?month=2026-11", nora);
        assertThat(JsonPath.<List<String>>read(month, "$.days[?(@.dots.length() > 0)].day"))
                .containsExactly("2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26", "2026-12-03");
        assertThat(JsonPath.<List<String>>read(month, "$.days[*].day"))
                .hasSize(42)
                .startsWith("2026-10-26")
                .endsWith("2026-12-06");
        assertThat(JsonPath.<List<Boolean>>read(month, "$.days[?(@.day == '2026-12-03')].inMonth"))
                .containsExactly(false);

        // It stops after the 19th.
        send(
                HttpMethod.PATCH,
                "/v1/events/" + swimming,
                nora,
                "{\"repeat\":{\"unit\":\"week\",\"days\":[\"thu\"],\"until\":\"2026-11-19\"}}",
                200);
        assertThat(day(nora, "2026-11-26")).isEmpty();
        assertThat(JsonPath.<Object>read(fetch("/v1/events/" + swimming + "?day=2026-11-20", nora), "$.nextDay"))
                .isNull();
        send(HttpMethod.PATCH, "/v1/events/" + swimming, nora, "{\"stopRepeating\":true}", 200);
        assertThat(day(nora, "2026-11-12")).isEmpty();
        assertThat(day(nora, "2026-11-05")).hasSize(1);

        // "Every Tuesday and Friday", said on a Wednesday, starts on the Friday.
        String bins = event(
                nora, "Bins", "2026-11-11", "19:00", ",\"repeat\":{\"unit\":\"week\",\"days\":[\"tue\",\"fri\"]}");
        assertThat(JsonPath.<String>read(fetch("/v1/events/" + bins, nora), "$.day"))
                .isEqualTo("2026-11-13");
        // It can't stop before it starts.
        send(
                HttpMethod.PATCH,
                "/v1/events/" + bins,
                nora,
                "{\"repeat\":{\"unit\":\"week\",\"days\":[\"tue\"],\"until\":\"2026-11-01\"}}",
                400);
        send(HttpMethod.PATCH, "/v1/events/" + bins, nora, "{\"repeat\":{\"unit\":\"sometimes\"}}", 400);
    }

    @Test
    void theDaysListSaysWhoseEachThingIsAndTheMonthCanShowOnePersonsDays() throws Exception {
        theLinds();
        event(
                alex,
                "School run",
                "2026-11-02",
                "08:00",
                ",\"audience\":\"circle\",\"repeat\":{\"unit\":\"week\",\"days\":[\"mon\",\"tue\",\"wed\",\"thu\",\"fri\"]},"
                        + "\"guests\":[{\"memberId\":\"%s\",\"part\":\"drives\"}]".formatted(alexId));
        event(
                nora,
                "Dentist · Mia",
                "2026-11-11",
                "15:30",
                ",\"audience\":\"circle\",\"place\":\"Trubarjeva 12\",\"guests\":[{\"memberId\":\"%s\"},{\"memberId\":\"%s\",\"part\":\"is taking her\"}]"
                        .formatted(miaId, alexId));
        event(
                nora,
                "Haircut · Leo",
                "2026-11-14",
                "10:00",
                ",\"audience\":\"circle\",\"remindMinutes\":60,\"guests\":[{\"memberId\":\"%s\"}]".formatted(leoId));
        event(
                nora,
                "Dinner at Grandma Astrid's",
                "2026-11-14",
                "18:30",
                ",\"audience\":\"circle\",\"notes\":\"bring the cookies\",\"guests\":[{\"memberId\":\"%s\"},{\"memberId\":\"%s\"},{\"memberId\":\"%s\"},{\"memberId\":\"%s\"}]"
                        .formatted(noraId, alexId, miaId, leoId));

        assertThat(day(nora, "2026-11-11"))
                .containsExactly("8:00|School run|Weekdays · Alex drives", "15:30|Dentist · Mia|Trubarjeva 12");
        assertThat(day(nora, "2026-11-14"))
                .containsExactly(
                        "10:00|Haircut · Leo|Reminds you an hour before",
                        "18:30|Dinner at Grandma Astrid's|Everyone · bring the cookies");

        String plan = fetch("/v1/circles/" + circle + "/plan?day=2026-11-11&days=4", nora);
        assertThat(JsonPath.<String>read(plan, "$.days[0].entries[1].whose.name"))
                .as("the first one it is for")
                .isEqualTo("Mia");
        assertThat(JsonPath.<Integer>read(plan, "$.days[0].entries[1].avatarUrls.length()"))
                .isEqualTo(0);
        assertThat(JsonPath.<String>read(plan, "$.days[0].entries[0].noteIcon")).isEqualTo("repeat");
        assertThat(JsonPath.<List<String>>read(plan, "$.days[*].day"))
                .as("the first day, and the days after it that have something")
                .containsExactly("2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14");
        // The week: Monday to Sunday, a dot per person; the dinner is everyone's (no member, tint 0).
        assertThat(JsonPath.<List<String>>read(plan, "$.week[*].day"))
                .hasSize(7)
                .startsWith("2026-11-09")
                .endsWith("2026-11-15");
        assertThat(JsonPath.<List<String>>read(plan, "$.week[2].dots[*].memberId"))
                .containsExactly(alexId, miaId);
        assertThat(JsonPath.<List<Integer>>read(plan, "$.week[5].dots[*].tint"))
                .hasSize(2)
                .endsWith(0);
        assertThat(JsonPath.<Object>read(plan, "$.days[3].entries[1].whose")).isNull();
        assertThat(JsonPath.<List<String>>read(plan, "$.week[6].dots")).isEmpty();

        // Filtered to Mia: the dentist and the dinner, not the school run or the haircut.
        String mias = fetch("/v1/circles/" + circle + "/plan?day=2026-11-11&days=4&member=" + miaId, nora);
        assertThat(JsonPath.<List<String>>read(mias, "$.days[*].entries[*].title"))
                .containsExactly("Dentist · Mia", "Dinner at Grandma Astrid's");
        String month = fetch("/v1/circles/" + circle + "/month?month=2026-11&member=" + leoId, nora);
        assertThat(JsonPath.<List<String>>read(month, "$.days[?(@.dots.length() > 0)].day"))
                .containsExactly("2026-11-14");
    }
}
